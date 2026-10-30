import { useEffect } from 'preact/hooks';
import { detectDatabase } from './database/database-detector';
import { useBusy, useDb, useFs } from './context';
import { elapsed, log, warn } from './log';
import { primaryButtonStyle, statusPillStyle } from './styles';

const DRIVE_TIMEOUT = 2000;

export const DriveSelect = () => {
    const { db, updateDb } = useDb();
    const { fs, updateFs } = useFs();
    const { updateBusy } = useBusy();

    useEffect(() => {
        let timeout: number | undefined;
        async function checkConnection () {
            try {
                if (fs) {
                    for await (const _ of fs.values()) { }
                    timeout = setTimeout(checkConnection, DRIVE_TIMEOUT);
                }
            } catch (e) {
                warn('drive: connection check failed; disconnecting', e);
                onDisconnect();
            }
        };
        checkConnection();
        return () => clearTimeout(timeout);
    }, [fs]);

    const onConnect = async () => {
        const start = performance.now();
        log('drive: select requested');
        const fileSystem = await window.showDirectoryPicker({ startIn: 'music', mode: 'readwrite' });
        if (fileSystem) {
            try {
                log('drive: selected folder', { name: fileSystem.name, elapsed: elapsed(start) });
                updateBusy(true);
                const database = await detectDatabase(fileSystem);
                log('drive: database detected', { type: database.type, elapsed: elapsed(start) });
                updateFs(fileSystem);
                updateDb(database);
                log('drive: connected', { type: database.type, name: fileSystem.name, elapsed: elapsed(start) });
            } catch (e) {
                warn('drive: connect failed', e);
                alert(e);
            } finally {
                updateBusy(false);
            }
        }
    };

    const onDisconnect = () => {
        log('drive: disconnect requested');
        updateFs(undefined);
        updateDb(undefined);
    };

    return (
        <>
            {db &&
                <button style={primaryButtonStyle}
                    onClick={onDisconnect}>
                    Disconnect
                </button>
            }
            <button style={primaryButtonStyle}
                onClick={onConnect}>
                Select Device Drive
            </button>
            {fs && db && <span style={statusPillStyle}>Connected ({db.type}): {fs.name}</span>}
        </>
    );
};
