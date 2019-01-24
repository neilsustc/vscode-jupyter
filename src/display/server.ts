import * as cors from 'cors';
import { EventEmitter } from 'events';
import * as express from 'express';
import { Express, Request, Response } from 'express';
import * as http from 'http';
import * as path from 'path';
import * as io from 'socket.io';
import * as uniqid from 'uniqid';
import * as vscode from 'vscode';
import { createDeferred, Deferred } from '../common/helpers';

export class Server extends EventEmitter {
    private server: SocketIO.Server;
    private app: Express;
    private httpServer: http.Server;
    private clients: SocketIO.Socket[] = [];
    private port: number;
    private responsePromises: Map<string, Deferred<boolean>>;

    constructor() {
        super();
        this.responsePromises = new Map<string, Deferred<boolean>>();
    }

    public dispose() {
        this.app = null;
        this.port = null;
        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
        }
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }

    public start(): Promise<number> {
        if (this.port) {
            return Promise.resolve(this.port);
        }

        let def = createDeferred<number>();

        this.app = express();
        this.httpServer = http.createServer(this.app);
        this.server = io(this.httpServer);

        let rootDirectory = path.join(__dirname, '..', '..', 'browser');
        this.app.use(express.static(rootDirectory));
        // Required by transformime
        // It will look in the path http://localhost:port/resources/MathJax/MathJax.js
        this.app.use(express.static(path.join(__dirname, '..', '..', '..', 'node_modules', 'mathjax-electron')));
        this.app.use(cors());
        // this.app.get('/', function (req, res, next) {
        //     res.sendFile(path.join(rootDirectory, 'index.html'));
        // });
        this.app.get('/', (req, res, next) => {
            this.rootRequestHandler(req, res);
        });

        this.httpServer.listen(0, () => {
            this.port = this.httpServer.address().port;
            console.log('port', this.port);
            def.resolve(this.port);
            def = null;
        });
        this.httpServer.on('error', error => {
            if (def) {
                def.reject(error);
            }
        });

        this.server.on('connection', this.onSocketConnection.bind(this));
        return def.promise;
    }

    public rootRequestHandler(req: Request, res: Response) {
        let backgroundColor: string = req.query.backgroundcolor;
        let color: string = req.query.color;
        let editorConfig = vscode.workspace.getConfiguration('editor', null);
        let editorFontFamily = editorConfig.get<String>('fontFamily');
        let editorFontSize = editorConfig.get<Number>('fontSize');

        res.send(this.getResultsPage({
            backgroundColor: backgroundColor,
            color: color,
            editorFontFamily: editorFontFamily,
            editorFontSize: editorFontSize
        }));
    }

    private buffer: any[] = [];

    public clearClientResults() {
        for (const client of this.clients) {
            client.emit('clearClientResults');
        }
    }

    public setClientAppendResults(value: boolean) {
        for (const client of this.clients) {
            client.emit('setClientAppendResults', value);
        }
    }

    public clearBuffer() {
        this.buffer = [];
    }

    public sendResults(data: any[]) {
        // Add an id to each item (poor separation of concerns... but what ever)
        let results = data.map(item => { return { id: uniqid('x'), value: item }; });
        this.buffer = this.buffer.concat(results);
        this.broadcast('results', results);
    }

    private broadcast(eventName: string, data: any) {
        this.server.emit(eventName, data);
    }

    private onSocketConnection(socket: SocketIO.Socket) {
        this.clients.push(socket);

        socket.on('disconnect', () => {
            const index = this.clients.findIndex(sock => sock.id === socket.id);
            if (index >= 0) {
                this.clients.splice(index, 1);
            }
        });

        socket.on('clientExists', (data: { id: string }) => {
            console.log('clientExists, on server');
            console.log(data);
            if (!this.responsePromises.has(data.id)) {
                console.log('Not found');
                return;
            }
            const def = this.responsePromises.get(data.id);
            this.responsePromises.delete(data.id);
            def.resolve(true);
        });

        socket.on('vscode.settings.updateAppendResults', (data: any) => {
            this.emit('vscode.settings.updateAppendResults', data);
        });

        socket.on('clearResults', () => {
            this.buffer = [];
        });

        socket.on('results.ack', () => {
            this.buffer = [];
        });

        this.emit('connected');

        // Someone is connected, send them the data we have
        socket.emit('results', this.buffer);
    }

    public clientsConnected(timeoutMilliSeconds: number): Promise<any> {
        const id = new Date().getTime().toString();
        const def = createDeferred<boolean>();
        this.broadcast('clientExists', { id: id });
        this.responsePromises.set(id, def);

        setTimeout(() => {
            if (this.responsePromises.has(id)) {
                this.responsePromises.delete(id);
                def.resolve(false);
                console.log("Timeout");
            }
        }, timeoutMilliSeconds);

        return def.promise;
    }

    private getResultsPage(values) {
        return `<!doctype html>
            <html>
            
            <head>
                <meta charset="utf-8">
                <title>Jupyter Notebook</title>
                <style>
                    :root {
                        --editor-font-family: ${values.editorFontFamily};
                        --editor-font-size: ${values.editorFontSize}px;
                    }

                    body {
                        background-color: ${values.backgroundColor};
                        color: ${values.color};
                        margin: 0;
                        width: fit-content;
                    }
                </style>
                <link rel="stylesheet" type="text/css" href="/main.css" />
                ${values.theme === 'vscode-light'
                ? '<link rel="stylesheet" type="text/css" href="/color-theme-light.css" />'
                : '<link rel="stylesheet" type="text/css" href="/color-theme-dark.css" />'}
            </head>
            
            <body>
                <script type="text/javascript" src="/socket.io/socket.io.js"></script>
                <div id="root"></div>
                <!-- Should be after div#root -->
                <script type="text/javascript" src="/vendor.bundle.js"></script>
                <script type="text/javascript" src="/bundle.js"></script>
            </body>
            
            </html>`;
    }
}