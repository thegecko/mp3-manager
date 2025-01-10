import { detectDatabase } from './database/database-detector';
import { useDb, useFolders } from './context';

export const DriveSelect = () => {
    const { updateDb } = useDb();
    const { updateFolders } = useFolders();

    const onClick = async () => {
        const fileSystem = await window.showDirectoryPicker({ startIn: 'music', mode: 'readwrite' });
        if (fileSystem) {
            try {
                const database = await detectDatabase(fileSystem);
                updateDb(database);
                const folders = await database.getFolders();
                updateFolders(folders);
            } catch (e) {
                alert(e);
            }
        }
    };

    return (
        <button
            class="bg-blue-500 hover:bg-blue-400 rounded-md text-white px-2 py-1 m-2"
            onClick={onClick}>
            Select Drive
        </button>
    );
};
