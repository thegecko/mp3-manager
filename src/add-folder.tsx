import { useFolders } from './context';

export const AddFolder = () => {
    const { folders, updateFolders } = useFolders();

    const onClick = () => {
        const name = prompt('Enter the name of the folder', 'New Folder');
        if (!name) {
            return;
        }

        folders.unshift({ id: -1, name, tracks: [] });
        updateFolders(folders);
    };

    return (
        <button
            class="bg-blue-500 hover:bg-blue-400 rounded-md text-white px-2 py-1 m-2"
            onClick={onClick}>
            Add Folder
        </button>
    );
};
