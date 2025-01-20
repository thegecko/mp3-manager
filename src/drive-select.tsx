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
    const { updateDb } = useDb();
    const { updateDrive } = useDrive();

    const onClick = async () => {
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

    return (
        <button style={style}
            onClick={onClick}>
            Select Drive
        </button>
    );
};
