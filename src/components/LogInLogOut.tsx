import {observer} from 'mobx-react';
import * as React from 'react';
import store from '../store';

interface Props { store: typeof store };

const initialState = { email: '' };
@observer
export default class LogInLogOut extends React.Component<Props, typeof initialState> {
  public render() {
    if (this.props.store.loggedIn) {
      return (
        <button
          /* tslint:disable */
          onClick={() => this.props.store!.logOut()}
          /* tslint:enable */
          className="btn"
        >Log Out
        </button>
      );
    } else {
      /* tslint:disable-next-line:jsx-no-lambda */
      return <button onClick={() => store.showLogin()} className="btn btn-primary">Log In</button>;
    }
  }
}
