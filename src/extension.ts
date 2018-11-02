'use strict';

import * as vscode from 'vscode';
import { LanguageProvider, LanguageProviders } from './common/languageProvider';
import { Jupyter } from './main';

// Required by @jupyter/services
(global as any).XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
(global as any).requirejs = require('requirejs');
(global as any).WebSocket = require('ws');

export function activate(context: vscode.ExtensionContext) {
    // sendTelemetryEvent(EVENT_LOAD);

    let outputChannel = vscode.window.createOutputChannel('Jupyter');
    // TODO: ?
    let jupyter = new Jupyter(outputChannel);

    context.subscriptions.push(outputChannel, jupyter);

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        jupyter.hasCodeCells(activeEditor.document, null);
    }

    // TODO: ?
    return {
        registerLanguageProvider: (language: string, provider: LanguageProvider) => {
            LanguageProviders.registerLanguageProvider(language, provider);
        },
        hasCodeCells: (document: vscode.TextDocument, token: vscode.CancellationToken) => {
            return jupyter.hasCodeCells(document, token);
        }
    };
}

export function deactivate() { }