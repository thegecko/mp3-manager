import { FileManager } from './manager/file-manager';
import { Warning } from './warning';
import { DriveSelect } from './drive-select';
import { ContextProvider } from './context';

const mainStyle = {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column'
}

const footerStyle = {
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    background: 'lightblue',
}

export const App = () => {
    return (
        <ContextProvider>
            <div style={mainStyle}>
                <Warning />
                <FileManager />
                <div style={footerStyle}>
                    <DriveSelect />
                </div>
            </div>
        </ContextProvider>
    );
};
