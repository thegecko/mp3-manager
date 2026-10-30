import { useEffect } from 'preact/hooks';
import { useDb } from './context';
import { FileManager } from './manager/file-manager';
import { log } from './log';
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
    useEffect(() => {
        log('app: started', {
            userAgent: navigator.userAgent,
            hasFileSystemApi: typeof showDirectoryPicker !== 'undefined',
            hasAudioApi: typeof AudioContext !== 'undefined'
        });
    }, []);

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
