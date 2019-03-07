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
        lineHeight: 1.375,
        padding: '1rem',
        width: 'fit-content'
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
