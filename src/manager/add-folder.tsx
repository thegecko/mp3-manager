import { useFolders } from '../context';

const style = {
    color: 'white',
    background: 'dodgerblue',
    padding: '0.5rem',
    marginRight: '10px',
    borderRadius: '5px',
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
