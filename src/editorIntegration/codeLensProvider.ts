'use strict';

import { CancellationToken, CodeLens, CodeLensProvider, Command, TextDocument, workspace } from 'vscode';
import { CellHelper } from '../common/cellHelper';
import { Commands } from '../common/constants';

export class JupyterCodeLensProvider implements CodeLensProvider {

    private cache: { fileName: string, documentVersion: number, lenses: CodeLens[] }[] = [];

    public getCodeLenses(document: TextDocument, _: CancellationToken) {
        const index = this.cache.findIndex(item => item.fileName === document.fileName);
        if (index >= 0) {
            const item = this.cache[index];
            if (item.documentVersion === document.version) {
                return Promise.resolve(item.lenses);
            }
            this.cache.splice(index, 1);
        }

        const cells = CellHelper.getCells(document);
        if (cells.length === 0) {
            return Promise.resolve([]);
        }

        const lenses: CodeLens[] = [];
        cells.forEach((cell, index) => {
            const cmd: Command = {
                arguments: [document, cell.range],
                title: 'Run cell',
                command: Commands.Jupyter.ExecuteRangeInKernel
            };
            lenses.push(new CodeLens(cell.range, cmd));
        });

        this.cache.push({ fileName: document.fileName, documentVersion: document.version, lenses: lenses });

        return Promise.resolve(lenses);
    }

    public provideCodeLenses(document: TextDocument, token: CancellationToken): Thenable<CodeLens[]> {
        if (workspace.getConfiguration("jupyter.cellCodeLens").get<boolean>("enabled")) {
            return this.getCodeLenses(document, token);
        } else {
            return Promise.resolve([]);
        }
    }
}