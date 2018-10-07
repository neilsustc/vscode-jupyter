Forked from [DonJayamanne/vscodeJupyter](https://github.com/DonJayamanne/vscodeJupyter)

---

Download it → [![AppVeyor](https://img.shields.io/appveyor/ci/neilsustc/vscode-jupyter.svg?style=flat-square&label=appveyor%20build)](https://ci.appveyor.com/project/neilsustc/vscode-jupyter/build/artifacts)

- Built with the latest commit
    - [PR#97](https://github.com/DonJayamanne/vscodeJupyter/pull/97): Scroll to bottom when appending results
- Default keybinding
    - <kbd>Ctrl</kbd> + <kbd>Enter</kbd> for `execCurrentCell`
- UI improvements
    - Floated "Clear Results" button
    - Many details [PR#92](https://github.com/DonJayamanne/vscodeJupyter/pull/92)
- New option `jupyter.codelens.enabled`

![demo](images/demo.gif)

---

Recommend [Highlight](https://marketplace.visualstudio.com/items?itemName=fabiospampinato.vscode-highlight) extension with setting

```json
"highlight.regexes": {
    "(^# ?%%.*)": {
        "decorations": [
            {
                "after": {
                    "border": "1px dashed #999",
                    "contentText": "",
                    "height": "2px",
                    "margin": "0 0 4px 10px",
                    "width": "50%"
                }
            }
        ]
    }
}
```