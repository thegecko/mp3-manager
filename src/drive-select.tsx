import { useEffect } from 'preact/hooks';
import { detectDatabase } from './database/database-detector';
import { useDb, useFs } from './context';

const style = {
    color: 'white',
    background: 'dodgerblue',
    padding: '0.5rem',
    marginRight: '10px',
    borderRadius: '5px',
}

const DRIVE_TIMEOUT = 2000;

export const DriveSelect = () => {
    const { db, updateDb } = useDb();
    const { fs, updateFs } = useFs();

    useEffect(() => {
        let timeout: number | undefined;
        async function checkConnection () {
            try {
                if (fs) {
                    for await (const _ of fs.values()) { }
                    timeout = setTimeout(checkConnection, DRIVE_TIMEOUT);
                }
            } catch (e) {
                onDisconnect();
            }
        };
        checkConnection();
        return () => clearTimeout(timeout);
    }, [fs]);

    const onConnect = async () => {
        const fileSystem = await window.showDirectoryPicker({ startIn: 'music', mode: 'readwrite' });
        if (fileSystem) {
            try {
                const database = await detectDatabase(fileSystem);
                updateFs(fileSystem);
                updateDb(database);
            } catch (e) {
                alert(e);
            }
        }
    };

    const onDisconnect = () => {
        updateFs(undefined);
        updateDb(undefined);
    };

    return (
        <>
            {db &&
                <button style={style}
                    onClick={onDisconnect}>
                    Disconnect
                </button>
            }
            <button style={style}
                onClick={onConnect}>
                Select Drive
            </button>
            {fs && `Connected to: ${fs.name}`}
        </>
    );
};
