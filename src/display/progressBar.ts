import { StatusBarItem, window } from 'vscode';

export class ProgressBar {
    private static _instance = new ProgressBar();
    private progressStatusBar: StatusBarItem;
    private progressInterval: NodeJS.Timer;
    private promises: Promise<any>[] = [];

    constructor() {
        this.progressStatusBar = window.createStatusBarItem();
    }

    public static get Instance(): ProgressBar {
        return ProgressBar._instance;
    }

    dispose() {
        this.progressStatusBar.dispose();
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    setProgressMessage(message: string, promise: Promise<any>) {
        this.promises.push(promise);
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        this.progressStatusBar.text = message;
        this.progressStatusBar.show();
        let counter = 0;
        const suffix = ['', '.', '..', '...'];
        this.progressInterval = setInterval(() => {
            this.progressStatusBar.text = message + suffix[counter % 4];
            counter++;
        }, 500);

        promise
            .then(() => {
                this.progressStatusBar.text = '';
                this.progressStatusBar.hide();
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            })
            .catch(() => {
                this.progressStatusBar.text = '';
                this.progressStatusBar.hide();
                clearInterval(this.progressInterval);
                this.progressInterval = null;
            });
    }
}