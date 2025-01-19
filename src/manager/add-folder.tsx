import { useFolders } from '../context';

const style = {
    color: 'white',
    background: 'dodgerblue',
    padding: '0.5rem',
    margin: '0.5rem',
    borderRadius: '0.375rem',
}

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
        <button style={style}
            onClick={onClick}>
            Add Folder
        </button>
    );
};
