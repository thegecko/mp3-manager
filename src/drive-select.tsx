import { useEffect } from 'preact/hooks';
import { detectDatabase } from './database/database-detector';
import { useBusy, useDb, useFs } from './context';
import { Init } from './init';
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
                updateBusy(true);
                const database = await detectDatabase(fileSystem);
                updateFs(fileSystem);
                updateDb(database);
            } catch (e) {
                alert(e);
            } finally {
                updateBusy(false);
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
                <button style={primaryButtonStyle}
                    onClick={onDisconnect}>
                    Disconnect
                </button>
            }
            <button style={primaryButtonStyle}
                onClick={onConnect}>
                Select Device Drive
            </button>
            <Init />
            {fs && db && <span style={statusPillStyle}>Connected: {fs.name} ({db.type})</span>}
        </>
    );
};
