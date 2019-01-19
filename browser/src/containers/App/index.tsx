import * as React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import 'socket.io-client';
import * as ResultActions from '../../actions/results';
import Header from '../../components/Header';
import ResultList from '../../components/ResultList';
import { RootState } from '../../reducers';

interface AppProps {
    settings: NotebookResultSettings;
    resultActions: typeof ResultActions;
    results: NotebookResultsState;
};

interface AppState {
    /* empty */
}

class App extends React.Component<AppProps, AppState>{
    private socket: SocketIOClient.Socket;

    constructor(props?: AppProps, context?: any) {
        super(props, context);

        // Use io (object) available in the script
        this.socket = (window as any).io();
        this.socket.on('connect', () => {
            // Do nothing
        });

        this.socket.on('clientExists', (data: any) => {
            this.socket.emit('clientExists', { id: data.id });
        });

        this.socket.on('results', (value: NotebookOutput[]) => {
            if (!this.props.settings.appendResults) {
                this.props.resultActions.clearResults();
            }
            this.socket.emit('results.ack');
            this.props.resultActions.addResults(value);

            let resultsList = document.getElementById('results-list');
            resultsList.scrollTop = resultsList.scrollHeight;
        });

        this.socket.on('clearClientResults', () => {
            this.props.resultActions.clearResults();
        });

        // TODO setAppendResults
    }

    private toggleAppendResults() {
        const value = !this.props.settings.appendResults;
        this.socket.emit('vscode.settings.updateAppendResults', value);
        this.props.resultActions.setAppendResults(value);
    }

    render() {
        const { children, results, settings } = this.props;
        return (
            <div>
                <Header appendResults={settings.appendResults}
                    toggleAppendResults={() => this.toggleAppendResults()}>
                </Header>
                <ResultList results={results}></ResultList>
                {children}
            </div>
        );
    }
}

function mapStateToProps(state: RootState) {
    return {
        settings: state.settings,
        results: state.results
    };
}

function mapDispatchToProps(dispatch) {
    return {
        resultActions: bindActionCreators(ResultActions as any, dispatch)
    };
}

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(App);
