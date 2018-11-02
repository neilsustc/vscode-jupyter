import { EventEmitter } from 'events';
import { Disposable, window, workspace } from 'vscode';
import { createDeferred } from '../../common/helpers';
import { Notebook } from './contracts';
import { NotebookFactory } from './factory';
import { getAvailableNotebooks } from './utils';
import { SystemVariables } from '../../common/systemVariables';

export { Notebook } from './contracts';
export { inputNotebookDetails, selectExistingNotebook } from './utils';

export class NotebookManager extends EventEmitter {
    private factory: NotebookFactory;
    private disposables: Disposable[] = [];
    private _currentNotebook: Notebook;

    constructor() {
        super();
        this.factory = new NotebookFactory();
        this.factory.on('onShutdown', () => {
            this.emit('onShutdown');
        })
        this.disposables.push(this.factory);
    }

    dispose() {
        this.disposables.forEach(d => {
            d.dispose();
        });
        this.disposables = [];
    }

    setNotebook(notebook: Notebook) {
        this._currentNotebook = notebook;
        this.emit('onNotebookChanged', notebook);
    }

    canShutdown(nb: Notebook): boolean {
        return this.factory.canShutdown(nb.baseUrl);
    }

    shutdown() {
        this.factory.shutdown();
        this.emit('onShutdown');
    }

    startNewNotebook() {
        this.shutdown();
        return this.factory.startNewNotebook().then(nb => {
            this._currentNotebook = nb;
            return nb;
        });
    }

    getNotebook(): Promise<Notebook> {
        if (this._currentNotebook && this._currentNotebook.baseUrl.length > 0) {
            return Promise.resolve(this._currentNotebook);
        }

        let deferred = createDeferred<Notebook>();

        const strStartNew = 'Start a new notebook';
        const strSelectExisting = 'Select an existing notebook';

        let sysVars = new SystemVariables();
        let jupyterSettings = workspace.getConfiguration('jupyter');
        let startupFolder = sysVars.resolve(jupyterSettings.get('notebook.startupFolder', workspace.rootPath || __dirname));
        if (startupFolder.match(/^[c-z]:/)) {
            startupFolder = startupFolder[0].toUpperCase() + startupFolder.substring(1);
        }

        // TODO: nb.startupFolder is wrong
        // TODO: make QuickPickItems to be Thenable<>
        getAvailableNotebooks()
            .then(notebooks => {
                let nbItems = notebooks.map(nb => {
                    let details = nb.startupFolder && nb.startupFolder.length > 0 ? `startup folder: ${nb.startupFolder}` : '';
                    return {
                        label: strSelectExisting,
                        description: nb.baseUrl,
                        detail: details,
                        notebook: nb
                    };
                });
                window.showQuickPick([
                    ...nbItems,
                    {
                        label: strStartNew,
                        description: '',
                        detail: `at ${startupFolder}`,
                        notebook: undefined
                    }
                ]).then(item => {
                    if (!item) {
                        deferred.resolve();
                    } else {
                        if (item.label === strStartNew) {
                            this.factory.startNewNotebook()
                                .then(deferred.resolve.bind(deferred))
                                .catch(deferred.reject.bind(deferred));
                        } else {
                            deferred.resolve(item.notebook);
                        }
                    }
                });
            });

        deferred.promise.then(nb => {
            this._currentNotebook = nb;
        });

        return deferred.promise;
    }
}