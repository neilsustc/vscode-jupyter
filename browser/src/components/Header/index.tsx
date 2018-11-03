import * as React from 'react';

interface HeaderProps {
    clearResults: () => any;
    toggleAppendResults: () => any;
    appendResults: boolean;
}

interface HeaderState {
    /* empty */
}

class Header extends React.Component<HeaderProps, HeaderState> {

    constructor(props?: HeaderProps, context?: any) {
        super(props, context);
    }

    private styles: React.CSSProperties = {
        position: 'fixed',
        top: '0',
        left: '0',
        width: 'calc(100% - 1em)',
        padding: '.5em',
        boxShadow: '0px 0px 6px rgba(0, 0, 0, 0.5)'
    };

    render() {
        return (
            <header style={this.styles}>
                <label>
                    <input type="checkbox"
                        style={{ verticalAlign: 'middle' }}
                        checked={this.props.appendResults}
                        onChange={() => this.props.toggleAppendResults()} />
                    Append Results
                </label>
                &nbsp;
                <button onClick={() => this.props.clearResults()}>Clear Results</button>
            </header>
        );
    }
}

export default Header;
