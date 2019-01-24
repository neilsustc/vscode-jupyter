import { Kernel } from '@jupyterlab/services';
import * as Rx from 'rx';
import { CancellationToken, commands, Disposable, languages, OutputChannel, Range, TextDocument, TextEditor, window, workspace } from 'vscode';
import { CodeHelper } from './common/codeHelper';
import { Commands } from './common/constants';
import { createDeferred, Deferred } from './common/helpers';
import { LanguageProviders } from './common/languageProvider';
import { formatErrorForLogging } from './common/utils';
import { ParsedIOMessage } from './contracts';
import { KernelStatus } from './display/kernelStatus';
import { JupyterDisplay, ProgressBar } from './display/main';
import { JupyterCodeLensProvider } from './editorIntegration/codeLensProvider';
import { JupyterSymbolProvider } from './editorIntegration/symbolProvider';
import { MessageParser } from './jupyterServices/jupyter_client/resultParser';
import { Manager } from './jupyterServices/manager';
import { inputNotebookDetails, Notebook, NotebookManager, selectExistingNotebook } from './jupyterServices/notebook/manager';
import { KernelManagerImpl } from './kernel-manager';
import { JupyterClientAdapter } from "./pythonClient/jupyter_client/main";
import * as PyManager from './pythonClient/manager';

// Todo: Refactor the error handling and displaying of messages
export class Jupyter extends Disposable {
    public kernelManager: KernelManagerImpl;
    public kernel: Kernel.IKernel = null;
    private status: KernelStatus;
    private disposables: Disposable[];
    private display: JupyterDisplay;
    private codeLensProvider: JupyterCodeLensProvider;
    private codeHelper: CodeHelper;
    private messageParser: MessageParser;
    private notebookManager: NotebookManager;

    private kernelCreationPromise: Deferred<KernelManagerImpl>;
    private jupyterVersionWorksWithJSServices: boolean;

    private updateDecorationTimeout = null;
    private cellDecorationType = window.createTextEditorDecorationType({ isWholeLine: true, border: '1px dashed #999', borderWidth: '1px 0 0' });

    constructor(private outputChannel: OutputChannel) {
        super(() => { });
        this.disposables = [];
        this.messageParser = new MessageParser();

        this.registerCommands();
        this.registerKernelCommands();
        this.registerDecorations();
        this.activate();
    }

    public dispose() {
        this.kernelManager.dispose();
        this.disposables.forEach(d => d.dispose());
        ProgressBar.Instance.dispose();
    }

    private getKernelManager(): Promise<KernelManagerImpl> {
        return this.createKernelManager();
    }

    private createKernelManager(): Promise<KernelManagerImpl> {
        if (this.kernelCreationPromise) {
            return this.kernelCreationPromise.promise;
        }

        this.kernelCreationPromise = createDeferred<any>();

        KernelManagerImpl.jupyterVersionWorksWithJSServices(this.outputChannel)
            .then(yes => {
                this.jupyterVersionWorksWithJSServices = yes;
                if (yes) {
                    this.kernelManager = new Manager(this.outputChannel, this.notebookManager);
                } else {
                    const jupyterClient = new JupyterClientAdapter(this.outputChannel, workspace.rootPath);
                    this.kernelManager = new PyManager.Manager(this.outputChannel, this.notebookManager, jupyterClient);
                }

                this.kernelCreationPromise.resolve(this.kernelManager);

                // This happend when user changes it from status bar
                this.kernelManager.on('kernelChanged', (kernel: Kernel.IKernel, language: string) => {
                    this.onKernelChanged(kernel);
                });
            }).catch(error => {
                this.kernelCreationPromise.reject(error);
                throw error;
            });
    }

    private activate() {
        this.notebookManager = new NotebookManager();

        this.createKernelManager();

        this.codeLensProvider = new JupyterCodeLensProvider();
        let symbolProvider = new JupyterSymbolProvider();
        this.status = new KernelStatus();
        this.display = new JupyterDisplay(this.codeLensProvider, this.outputChannel);
        this.codeHelper = new CodeHelper(this.codeLensProvider);

        this.disposables.push(this.notebookManager);
        this.disposables.push(window.onDidChangeActiveTextEditor(this.onEditorChanged.bind(this)));
        this.disposables.push(this.status);
        this.disposables.push(this.display);

        LanguageProviders.getInstance().on('onLanguageProviderRegistered', (language: string) => {
            this.disposables.push(languages.registerCodeLensProvider(language, this.codeLensProvider));
            this.disposables.push(languages.registerDocumentSymbolProvider(language, symbolProvider));
        });

        this.handleNotebookEvents();
    }

    private handleNotebookEvents() {
        this.notebookManager.on('onNotebookChanged', (nb: Notebook) => {
            this.display.setNotebook(nb, this.notebookManager.canShutdown(nb));
        });
        this.notebookManager.on('onShutdown', () => {
            this.getKernelManager().then(k => k.clearAllKernels());
            this.onKernelChanged(null);
        });
    }

    public hasCodeCells(document: TextDocument, token: CancellationToken): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            this.codeLensProvider.getCodeLenses(document, token).then(codeLenses => {
                resolve(Array.isArray(codeLenses) && codeLenses.length > 0);
            }, reason => {
                console.error('Failed to detect code cells in document');
                console.error(reason);
                resolve(false);
            });
        });
    }

    private onEditorChanged(editor: TextEditor) {
        if (!editor || !editor.document) {
            return;
        }
        this.getKernelManager()
            .then(kernelManager => {
                const kernel = kernelManager.getRunningKernelFor(editor.document.languageId);
                if (this.kernel !== kernel && (this.kernel && kernel && this.kernel.id !== kernel.id)) {
                    return this.onKernelChanged(kernel);
                }
            });
    }

    onKernelChanged(kernel?: Kernel.IKernel) {
        if (kernel) {
            kernel.statusChanged.connect((sender, status) => {
                // We're only interested in status of the active kernels
                if (this.kernel && (sender.id === this.kernel.id)) {
                    this.status.setKernelStatus(status);
                }
            });
        }
        this.kernel = kernel;
        this.status.setActiveKernel(this.kernel);
    }

    executeCode(code: string, language: string): Promise<any> {
        return this.getKernelManager()
            .then(kernelManager => {
                const kernelToUse = kernelManager.getRunningKernelFor(language);
                if (kernelToUse) {
                    if (!this.kernel || kernelToUse.id !== this.kernel.id) {
                        this.onKernelChanged(kernelToUse);
                    }
                    return Promise.resolve(this.kernel);
                }
                else {
                    return kernelManager.startKernelFor(language).then(kernel => {
                        kernelManager.setRunningKernelFor(language, kernel);
                        return kernel;
                    });
                }
            }).then(() => {
                return this.executeAndDisplay(this.kernel, code).catch(reason => {
                    const message = typeof reason === 'string' ? reason : reason.message;
                    window.showErrorMessage(message);
                    this.outputChannel.appendLine(formatErrorForLogging(reason));
                });
            }).catch(reason => {
                let message = typeof reason === 'string' ? reason : reason.message;
                if (reason.xhr && reason.xhr.responseText) {
                    message = reason.xhr && reason.xhr.responseText;
                }
                if (!message) {
                    message = 'Unknown error';
                }
                this.outputChannel.appendLine(formatErrorForLogging(reason));
                window.showErrorMessage(message, 'View Errors').then(item => {
                    if (item === 'View Errors') {
                        this.outputChannel.show();
                    }
                });
            });
    }

    private executeAndDisplay(kernel: Kernel.IKernel, code: string): Promise<any> {
        let observable = this.executeCodeInKernel(kernel, code);
        return this.display.showResults(observable);
    }

    private executeCodeInKernel(kernel: Kernel.IKernel, code: string): Rx.Observable<ParsedIOMessage> {
        if (this.jupyterVersionWorksWithJSServices) {
            let source = Rx.Observable.create<ParsedIOMessage>(observer => {
                let future = kernel.requestExecute({ code: code });
                future.onDone = () => {
                    observer.onCompleted();
                };
                future.onIOPub = (msg) => {
                    this.messageParser.processResponse(msg, observer);
                };
            });
            return source;
        }
        else {
            return this.kernelManager.runCodeAsObservable(code, kernel);
        }
    }

    async executeSelection(): Promise<any> {
        const activeEditor = window.activeTextEditor;
        if (!activeEditor || !activeEditor.document) {
            return Promise.resolve();
        }
        let code = await this.codeHelper.getSelectedCode();
        let cellRange = await this.codeHelper.getActiveCell();
        let selectedCode = await LanguageProviders.getSelectedCode(activeEditor.document.languageId, code, cellRange);
        return this.executeCode(selectedCode, activeEditor.document.languageId);
    }

    private registerCommands() {
        this.disposables.push(
            commands.registerCommand(Commands.Jupyter.ExecuteRangeInKernel, (document: TextDocument, range: Range) => {
                if (!document || !range || range.isEmpty) {
                    return Promise.resolve();
                }
                const code = document.getText(range);
                return this.executeCode(code, document.languageId);
            }),
            commands.registerCommand(Commands.Jupyter.ExecuteSelectionOrLineInKernel, this.executeSelection.bind(this)),
            commands.registerCommand(Commands.Jupyter.Get_All_KernelSpecs_For_Language, (language: string) => {
                if (this.kernelManager) {
                    return this.kernelManager.getAllKernelSpecsFor(language);
                }
                return Promise.resolve();
            }),
            commands.registerCommand(Commands.Jupyter.StartKernelForKernelSpeck, (kernelSpec: Kernel.ISpecModel, language: string) => {
                if (this.kernelManager) {
                    return this.kernelManager.startKernel(kernelSpec, language);
                }
                return Promise.resolve();
            }),
            commands.registerCommand(Commands.Jupyter.StartNotebook, () => {
                this.notebookManager.startNewNotebook();
            }),
            commands.registerCommand(Commands.Jupyter.ProvideNotebookDetails, () => {
                inputNotebookDetails().then(nb => {
                    if (!nb) { return; }
                    this.notebookManager.setNotebook(nb);
                });
            }),
            commands.registerCommand(Commands.Jupyter.SelectExistingNotebook, () => {
                selectExistingNotebook().then(nb => {
                    if (!nb) { return; }
                    this.notebookManager.setNotebook(nb);
                });
            }),
            commands.registerCommand(Commands.Jupyter.Notebook.ShutDown, () => {
                this.notebookManager.shutdown();
            }),
            commands.registerCommand("extension.jupyter.clearResults", () => {
                this.display.clearResults();
            }),
            commands.registerCommand("extension.jupyter.toggleAppendResults", () => {
                this.display.toggleAppendResults();
            })
        );
    }

    private registerKernelCommands() {
        this.disposables.push(
            commands.registerCommand(Commands.Jupyter.Kernel.Interrupt, () => {
                this.kernel.interrupt();
            }),
            commands.registerCommand(Commands.Jupyter.Kernel.Restart, () => {
                if (this.kernelManager) {
                    this.kernelManager.restartKernel(this.kernel).then(kernel => {
                        kernel.getSpec().then(spec => {
                            this.kernelManager.setRunningKernelFor(spec.language, kernel);
                        });
                        this.onKernelChanged(kernel);
                    });
                }
            }),
            commands.registerCommand(Commands.Jupyter.Kernel.Shutdown, (kernel: Kernel.IKernel) => {
                kernel.getSpec().then(spec => {
                    this.kernelManager.destroyRunningKernelFor(spec.language);
                    this.onKernelChanged();
                });
            })
        );
    }

    /* ┌──────────────────┐
       │ Cell Decorations │
       └──────────────────┘ */

    private registerDecorations() {
        window.onDidChangeActiveTextEditor(this.updateDecorations);

        workspace.onDidChangeTextDocument(event => {
            let editor = window.activeTextEditor;
            if (editor !== undefined && event.document === editor.document) {
                this.triggerUpdateDecorations(editor);
            }
        });

        let editor = window.activeTextEditor;
        if (editor) {
            this.updateDecorations(editor);
        }
    }

    private triggerUpdateDecorations(editor) {
        if (this.updateDecorationTimeout) {
            clearTimeout(this.updateDecorationTimeout);
        }
        this.updateDecorationTimeout = setTimeout(() => this.updateDecorations(editor), 200);
    }

    private updateDecorations(editor?: TextEditor) {
        // if (!workspace.getConfiguration('extension.jupyter.cell').get<boolean>('decorations')) return;

        if (editor === undefined) {
            editor = window.activeTextEditor;
        }

        if (!(editor && editor.document && editor.document.languageId === 'python')) {
            return;
        }

        editor.setDecorations(this.cellDecorationType, []);

        editor.setDecorations(this.cellDecorationType, editor.document.getText().split(/\r?\n/g).reduce((previous, current, idx) => {
            if (/^# ?%%/.test(current) && idx !== 0) {
                previous.push(new Range(idx, 0, idx, 1));
            }
            return previous;
        }, []));
    }
};