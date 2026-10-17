
import { useCallback, useMemo, useState } from 'preact/hooks';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { FileContainer } from './file-container';
import { File } from './file';
import { AddFolder } from './add-folder';
import { NEW_ID, Card, buildFolders, getCards, getFiles, createFile, createZip, MP3_EXTENSION } from './util';
import { useBusy, useDb, useFolders } from '../context';
import type { Track } from '../database/database-detector';
import { DriveSelect } from '../drive-select';
import { Init } from '../init';

const isDataTransfer = (item: any): item is DataTransfer => item.items !== undefined;

const footerStyle = {
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    background: '#d5d5d5',
    padding: '0 10px',
}

export const FileManager = () => {
    const { db } = useDb();
    const { folders, updateFolders } = useFolders();
    const { updateBusy } = useBusy();
    const [cards, setCards] = useState([] as Card[]);
    const [collapsedFolder, setCollapsedFolder] = useState(undefined as number | undefined);

    // Container handlers
    const onNew = useCallback(() => {
        const newCard: Card = {
            id: NEW_ID,
            type: 'new',
            name: `add track(s)`
        };
        setCards(prevCards => [
            ...prevCards,
            newCard
        ]);
        return newCard;
    }, [cards])

    const clearNew = () => {
        const hasNew = cards.some(card => card.type === 'new');
        if (hasNew) {
            setCards(prevCards => [
                ...prevCards.filter(card => card.type !== 'new')
            ]);
        }
    };

    // File handlers
    const onHover = (dragRef?: Card): void => {
        setCollapsedFolder(dragRef?.type === 'folder' ? dragRef.id : undefined);
    };

    let requestedFrame: number | undefined;
    let dragid: number | undefined;
    let hoverid: number | undefined;
    const onMove = (dragRef: Card, hoverRef: Card): void => {
        if (requestedFrame || dragRef.id === dragid && hoverRef.id === hoverid) {
            return;
        }

        dragid = dragRef.id;
        hoverid = hoverRef.id;
        const removeIndex = cards.indexOf(dragRef)
        let insertIndex = cards.indexOf(hoverRef)

        if (removeIndex < 0 || insertIndex < 0) {
            return;
        }

        const trackCount = (folderIndex: number) => {
            let count = 0;
            for (let i = folderIndex + 1; i < cards.length; i++) {
                if (cards[i].type === 'folder') {
                    break;
                }
                count++;
            }
            return count;
        }

        let removeCount = 1;
        if (dragRef.type === 'folder') {
            const toMove = trackCount(removeIndex);
            removeCount = toMove + 1;
            if (removeIndex < insertIndex) {
                // Moving down
                insertIndex += (trackCount(insertIndex) - toMove);
            }
        }

        const newCards = [...cards];
        const deletedCards = newCards.splice(removeIndex, removeCount);
        newCards.splice(insertIndex, 0, ...deletedCards);

        requestedFrame = requestAnimationFrame(() => {
            setCards(newCards);
            requestedFrame = undefined;
        });
    }

    const onDrop = async (card: Card | DataTransfer) => {
        if (!db) {
            throw new Error('No database');
        }

        try {
            updateBusy(true);

            const newFolders = new Map<string, Track[]>();
            const newTracks: Track[] = [];
            if (isDataTransfer(card)) {
                const files = await getFiles(card);
                for (const { file, folder } of files) {
                    const track = await createFile(db, file);
                    if (track) {
                        if (folder) {
                            newFolders.set(folder, [...(newFolders.get(folder) || []), track]);
                        } else {
                            newTracks.push(track);
                        }
                    }
                }
            }
            const folders = buildFolders(cards, { newFolders, newTracks });
            updateFolders(folders);
        } finally {
            updateBusy(false);
        }
    };

    const onDelete = async (toDelete: Card) => {
        if (!db) {
            throw new Error('No database');
        }

        try {
            updateBusy(true);

            // Delete files
            let deletingTracks = false;
            for (const card of cards) {
                if (card.type === 'folder') {
                    deletingTracks = toDelete.id === card.id;
                } else if (deletingTracks || toDelete.id === card.id) {
                    await db.deleteFile(card.id);
                }
            }

            const folders = buildFolders(cards, { deleteId: toDelete.id });
            updateFolders(folders);
        } finally {
            updateBusy(false);
        }
    };

    const onRename = async (toRename: Card) => {
        const newTitle = prompt('Enter new title', toRename.name);
        if (!newTitle) {
            return;
        }

        let newArtist = toRename.artist;
        if (toRename.type === 'track') {
            newArtist = prompt('Enter new artist', newArtist) || undefined;
            if (!newArtist) {
                return;
            }
        }

        // Rename card
        const newCards = [...cards];
        const card = newCards.find(card => card.id === toRename.id);
        if (card) {
            card.name = newTitle;
            card.artist = newArtist;
        }

        const folders = buildFolders(newCards);
        updateFolders(folders);
    };

    const onDownload = async (card: Card) => {
        if (!db) {
            throw new Error('No database');
        }

        try {
            updateBusy(true);

            let file: File | undefined;
            if (card.type === 'folder') {
                const tracks: Card[] = [];
                const start = cards.indexOf(card) + 1;
                for (let i = start; i < cards.length && cards[i].type !== 'folder'; i++) {
                    if (cards[i].type === 'track') {
                        tracks.push(cards[i]);
                    }
                }
                const files = (await Promise.all(tracks.map(track => db.streamFile(track.id)))).filter(file => !!file) as File[];
                file = await createZip(card.name, files);
            } else {
                file = await db.streamFile(card.id);
            }

            if (file) {
                const url = URL.createObjectURL(file);
                const a = document.createElement("a");
                a.href = url;
                a.download = file.name || card.file || `${card.name}.${MP3_EXTENSION}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } finally {
            updateBusy(false);
        }
    };

    const onAdd = async (folderRef: Card) => {
        if (!db) {
            throw new Error('No database');
        }

        const files = await window.showOpenFilePicker({ startIn: 'music', types: [{ accept: { 'audio/mpeg': `.${MP3_EXTENSION}` } }], multiple: true });
        if (files) {
            try {
                updateBusy(true);

                const tracks: Track[] = [];
                for (const handle of files) {
                    const file = await handle.getFile();
                    const track = await createFile(db, file);

                    if (track) {
                        tracks.push(track);
                    }
                }

                if (tracks.length > 0) {
                    let insertIndex = cards.indexOf(folderRef) + 1;
                    if (insertIndex >= 0) {
                        const newCards = [...cards];
                        newCards.splice(insertIndex, 0, {
                            id: NEW_ID,
                            type: 'new',
                            name: `add track(s)`
                        });
                        const folders = buildFolders(newCards, { newTracks: tracks });
                        updateFolders(folders);
                    }
                }
            } finally {
                updateBusy(false);
            }
        }
    };

    const onYank = async (folderRef: Card) => {
        if (!db) {
            throw new Error('No database');
        }

        const trackUrl = prompt('Enter track URL', 'https://open.spotify.com/track/<id>');
        if (!trackUrl) {
            return;
        }
        
        const trackId = trackUrl.replace(/^(.*[\\\/])/, '').split('?').shift();
        if (trackId) {
            try {
                updateBusy(true);
                const yankUrl = `https://yank.g3v.co.uk/track/${trackId}`;
                console.log(yankUrl);
                const response = await fetch(yankUrl);
                const blob = await response.blob();
                const file = new File([blob], `${trackId}.${MP3_EXTENSION}`, { type: 'audio/mpeg' });
                const track = await createFile(db, file);

                if (track) {
                    let insertIndex = cards.indexOf(folderRef) + 1;
                    if (insertIndex >= 0) {
                        const newCards = [...cards];
                        newCards.splice(insertIndex, 0, {
                            id: NEW_ID,
                            type: 'new',
                            name: `add track(s)`
                        });
                        const folders = buildFolders(newCards, { newTracks: [track] });
                        updateFolders(folders);
                    }
                }
            } catch (e) {
                alert(e);
            } finally {
                updateBusy(false);
            }
        }
    };

    // Cards
    useMemo(() => {
        const cards = getCards(folders);
        setCards(cards);
    }, [folders]);

    const filtered: Card[] = [];

    let ignore = false;
    for (const card of cards) {
        if (card.type === 'folder') {
            filtered.push(card);
            ignore = !!collapsedFolder && card.id === collapsedFolder;
        } else if (!ignore) {
            filtered.push(card);
        }
    }

    const cardNodes = filtered
        .map(card =>
            <File
                key={card.id}
                id={card}
                text={card.name}
                title={card.artist}
                type={card.type}
                onHover={onHover}
                onMove={onMove}
                onDrop={onDrop}
                onDelete={onDelete}
                onRename={onRename}
                onDownload={onDownload}
                onAdd={onAdd}
                onYank={onYank}
            />
        );

    return (
        <>
            <DndProvider backend={HTML5Backend}>
                <FileContainer onNew={onNew} clearNew={clearNew}>
                    {cardNodes}
                </FileContainer>
            </DndProvider>
            <div style={footerStyle}>
                <AddFolder />
                <Init />
                <DriveSelect />
            </div>
        </>
    );
};
