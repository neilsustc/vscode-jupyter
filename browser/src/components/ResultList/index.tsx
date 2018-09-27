import * as React from 'react';
import Result from '../Result'
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
  render() {
    let results = this.props.results.map(result =>
      <Result key={result.id} result={result} />
    );
    return (
      <div style={{ padding: '.3em .5em 0 .5em' }}>
        {results}
      </div>
    );
  }
}

export default ResultList;
