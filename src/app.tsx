import { useDb } from './context';
import { FileManager } from './manager/file-manager';
import { Spinner } from './spinner';
import { Warning } from './warning';
import { Welcome } from './welcome';

const style = {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column'
}

export const App = () => {
    const { db } = useDb();
    return (
        <>
            <Spinner />
            <Warning />
            <div style={style}>
                {!!db && <FileManager />}
                {!db && <Welcome />}
            </div>
        </>
    );
};
