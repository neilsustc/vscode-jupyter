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
      <div style={{ position: 'fixed', top: 'calc(.5em + 21px + 1em)', left: '.5em', width: 'calc(100% - 1em)', height: 'calc(100% - .5em - 21px - 1em)', overflow: 'auto' }}>
        {results}
      </div>
    );
  }
}

export default ResultList;
