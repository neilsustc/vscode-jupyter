import * as React from 'react';
import Result from '../Result';

interface ResultProps {
    results: NotebookResultsState;
}

interface ResultState {
    /* empty */
}

class ResultList extends React.Component<ResultProps, ResultState> {

    private renderResult(result: NotebookOutput) {
        return
    }

    private styles: React.CSSProperties = {
        position: 'fixed',
        top: 'calc(.5em + 21px + .5em + .5em + .3em)',
        left: '.5em',
        padding: '0 1em 0 .5em',
        width: 'calc(100% - .5em - .5em - 1em)',
        height: 'calc(100% - 1.8em - 21px)',
        overflow: 'auto'
    };

    render() {
        let results = this.props.results.map(result =>
            <Result key={result.id} result={result} />
        );
        return (
            <div id={'results-list'} style={this.styles}>
                {results}
            </div>
        );
    }
}

export default ResultList;
