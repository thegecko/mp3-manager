import { ContextProvider } from './context';
import { FileManager } from './manager/file-manager';
import { Warning } from './warning';
import { DriveSelect } from './drive-select';
import { AddFolder } from './add-folder';

const mainStyle = {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column'
}

const footerStyle = {
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    background: 'lightgray',
}

export const App = () => {
    return (
        <ContextProvider>
            <div style={mainStyle}>
                <Warning />
                <FileManager />
                <div style={footerStyle}>
                    <DriveSelect />
                    <AddFolder />
                </div>
            </div>
        </ContextProvider>
    );
};
