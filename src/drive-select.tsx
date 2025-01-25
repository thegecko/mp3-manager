import { detectDatabase } from './database/database-detector';
import { useDb, useDrive } from './context';

const style = {
    color: 'white',
    background: 'dodgerblue',
    padding: '0.5rem',
    margin: '0.5rem',
    borderRadius: '0.375rem',
}

export const DriveSelect = () => {
    const { db, updateDb } = useDb();
    const { drive, updateDrive } = useDrive();

    const onConnect = async () => {
        const fileSystem = await window.showDirectoryPicker({ startIn: 'music', mode: 'readwrite' });
        if (fileSystem) {
            try {
                const database = await detectDatabase(fileSystem);
                updateDb(database);
                updateDrive(fileSystem.name);
            } catch (e) {
                alert(e);
            }
        }
    };

    const onDisconnect = () => {
        updateDb(undefined);
        updateDrive(undefined);
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
            {drive && `Connected to ${drive}`}
        </>
    );
};
