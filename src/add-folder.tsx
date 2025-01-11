import { useDb } from './context';

export const AddFolder = () => {
    const { db } = useDb();

    const onClick = async () => {
        if (!db) {
            throw new Error('No database');
        }

        const name = prompt('Enter the name of the folder', 'New Folder');
        if (!name) {
            return;
        }

        const folders = await db.getFolders();
        folders.unshift({ offset: 0, name, tracks: [] });
        await db.setFolders(folders);
    };

    return (
        <button
            class="bg-blue-500 hover:bg-blue-400 rounded-md text-white px-2 py-1 m-2"
            onClick={onClick}>
            Add Folder
        </button>
    );
};
