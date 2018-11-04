import * as querystring from 'query-string';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import { browserHistory, Route, Router } from 'react-router';
import { syncHistoryWithStore } from 'react-router-redux';
import App from './containers/App';
import configureStore from './store';

const store = configureStore();
const history = syncHistoryWithStore(browserHistory, store);

ReactDOM.render(
    <div>
        <Provider store={store}>
            <Router history={history}>
                <Route path="/" component={App}>
                </Route>
            </Router>
        </Provider>
    </div>,
    document.getElementById('root')
);
