import { Kernel } from '@jupyterlab/services';
import * as vscode from 'vscode';
import { Commands } from '../common/constants';
import { createDeferred } from '../common/helpers';
import { formatErrorForLogging } from '../common/utils';
import { ParsedIOMessage } from '../contracts';
import { JupyterCodeLensProvider } from '../editorIntegration/codeLensProvider';
import { Notebook } from '../jupyterServices/notebook/contracts';
import { CellOptions } from './cellOptions';
import { KernelPicker } from './kernelPicker';
import { TextDocumentContentProvider } from './resultView';
import { Server } from './server';

export { ProgressBar } from './progressBar';

const jupyterSchema = 'jupyter-result-viewer';
const previewUri = vscode.Uri.parse(jupyterSchema + '://authority/jupyter');

export class JupyterDisplay extends vscode.Disposable {
    private disposables: vscode.Disposable[];
    private previewWindow: TextDocumentContentProvider;
    private cellOptions: CellOptions;
    private server: Server;
    private clientConnected: boolean;
    private notebookUrl: string;
    private canShutdown: boolean;

    private panel: vscode.WebviewPanel;

    constructor(cellCodeLenses: JupyterCodeLensProvider, private outputChannel: vscode.OutputChannel) {
        super(() => { });
        this.disposables = [];
        this.server = new Server();
        this.disposables.push(this.server);
        this.disposables.push(new KernelPicker());
        this.disposables.push(vscode.commands.registerCommand(Commands.Jupyter.Kernel_Options, this.showKernelOptions.bind(this)));
        this.previewWindow = new TextDocumentContentProvider();
        this.disposables.push(vscode.workspace.registerTextDocumentContentProvider(jupyterSchema, this.previewWindow));
        this.cellOptions = new CellOptions(cellCodeLenses);
        this.disposables.push(this.cellOptions);

        this.server.on('connected', () => {
            this.clientConnected = true;
            this.server.setClientAppendResults(vscode.workspace.getConfiguration('jupyter').get<boolean>('appendResults', true));
        });
    }

    public setNotebook(nb: Notebook, canShutdown: boolean) {
        this.notebookUrl = (nb && nb.baseUrl) || '';
        this.canShutdown = canShutdown;
    }

    public clearResults() {
        this.server.clearClientResults();
    }

    public toggleAppendResults() {
        const config = vscode.workspace.getConfiguration('jupyter');
        const newValue = !config.get<boolean>('appendResults', true);
        config.update('appendResults', newValue, true);
        this.server.setClientAppendResults(newValue);
    }

    public showResults(results: Rx.Observable<ParsedIOMessage>): Promise<any> {
        return this.server.start().then(port => {
            this.previewWindow.ServerPort = port;
            // If we need to append the results, then do so if we have any result windows open
            let sendDataToResultView = this.server.clientsConnected(2000);

            return sendDataToResultView.then(clientConnected => {
                // If connected to result view, then send results over sockets as they arrive
                if (clientConnected) {
                    this.server.clearBuffer();
                    results.subscribe(result => {
                        this.server.sendResults([result.data]);
                    });
                    return Promise.resolve();
                }

                // Wait till we have at least one item to be displayed before opening the results view
                const def = createDeferred<any>();
                this.clientConnected = false;
                results.subscribe(result => {
                    this.server.sendResults([result.data]);

                    if (this.clientConnected) {
                        this.server.clearBuffer();
                        return;
                    }

                    this.launchResultViewAndDisplayResults(port).
                        then(def.resolve.bind(def)).catch(def.reject.bind(def));
                });
                results.subscribeOnCompleted(() => {
                    if (!def.completed) {
                        def.resolve();
                    }
                });
                return def.promise;
            });
        });
    }

    private launchResultViewAndDisplayResults(port: number): Promise<any> {

        const def = createDeferred<any>();

        if (this.panel === undefined) {
            this.panel = vscode.window.createWebviewPanel('jupyter-results', 'Jupyter Results', vscode.ViewColumn.Two, {
                enableScripts: true,
                retainContextWhenHidden: true
            });

            this.panel.webview.html = `
            <!DOCTYPE html>
            <head>
                <style>
                    html, body { height: 100%; width: 100%; }
                    body { margin: 0; padding: 0; }
                </style>
                <script>
                    function start() {
                        var color = '';
                        var fontFamily = '';
                        var fontSize = '';
                        var theme = '';
                        var fontWeight = '';
                        try {
                            computedStyle = window.getComputedStyle(document.body);
                            color = computedStyle.color + '';
                            backgroundColor = computedStyle.backgroundColor + '';
                            fontFamily = computedStyle.fontFamily;
                            fontSize = computedStyle.fontSize;
                            fontWeight = computedStyle.fontWeight;
                            theme = document.body.className;
                        } catch (ex) { }
                    
                        document.getElementById('resultsFrame').src = 'http://localhost:${port}/?theme=' + theme + '&color=' + encodeURIComponent(color) + "&backgroundColor=" + encodeURIComponent(backgroundColor) + "&fontFamily=" + encodeURIComponent(fontFamily) + "&fontWeight=" + encodeURIComponent(fontWeight) + "&fontSize=" + encodeURIComponent(fontSize);
                    }
                </script>
            </head>
            <body onload="start()">
                <iframe id="resultsFrame" frameborder="0" style="border: 0px solid transparent; height: calc(100% - 3px); width: 100%;" src="" seamless></iframe>
            </body>
            </html>`;

            vscode.commands.executeCommand('setContext', 'jupyter.results.focused', true);

            this.panel.onDidChangeViewState(_ => {
                vscode.commands.executeCommand('setContext', 'jupyter.results.focused', this.panel.active);
            });

            this.panel.onDidDispose(_ => {
                this.panel = undefined;
            });
        }

        def.resolve();
        return def.promise;
    }

    public dispose() {
        this.disposables.forEach(d => d.dispose());
    }

    private async showKernelOptions(selectedKernel: Kernel.IKernel): Promise<any> {
        let description = '';
        let spec = await selectedKernel.getSpec();
        if (spec.display_name.toLowerCase().indexOf(spec.language.toLowerCase()) === -1) {
            description = `${spec.name} for ${spec.language}`;
        }
        const options = [
            {
                label: `Interrupt ${spec.display_name} Kernel`,
                description: description,
                command: Commands.Jupyter.Kernel.Interrupt,
                args: [selectedKernel]
            },
            {
                label: `Restart ${spec.display_name} Kernel`,
                description: description,
                command: Commands.Jupyter.Kernel.Restart,
                args: [selectedKernel]
            },
            {
                label: `Shut Down ${spec.display_name} Kernel`,
                description: description,
                command: Commands.Jupyter.Kernel.Shutdown,
                args: [selectedKernel]
            },
            {
                label: `Select another ${spec.language} Kernel`,
                description: ` `,
                command: Commands.Jupyter.Kernel.Select,
                args: [spec.language]
            }
        ];

        if (this.canShutdown) {
            options.push({
                label: `Shut Down Notebook`,
                description: `Notebook running on ${this.notebookUrl}`,
                command: Commands.Jupyter.Notebook.ShutDown,
                args: []
            });
        }
        return vscode.window.showQuickPick(options).then(option => {
            if (!option || !option.command || option.command.length === 0) {
                return;
            }
            return vscode.commands.executeCommand(option.command, ...option.args);
        });
    }
}