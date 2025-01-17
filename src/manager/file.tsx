import { useRef } from 'preact/hooks'
import { memo } from 'preact/compat'
import { useDrag, useDrop } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'

const ItemTypes = {
	FILE: 'file',
}

const style = {
	display: 'flex',
	cursor: 'move',
	padding: '0.1rem',
	margin: '.2rem',
	border: '1px solid gray'
}

export interface FileProps {
	id: any;
	type: 'folder' | 'track' | 'new';
	text: string;
	title?: string;
	onHover: (dragRef?: any) => void;
	onMove: (dragRef: any, hoverRef: any) => void;
	onDrop: (item: any) => void
	onDelete: (id: any) => void
	onRename: (id: any) => void
	onDownload: (id: any) => void
}

export const File = memo((props: FileProps) => {
	const { id, type, text, title, onHover, onMove, onDrop, onDelete, onRename, onDownload } = props
	const ref = useRef(null)

	const [{ isDragging, handlerId }, connectDrag] = useDrag({
		type: ItemTypes.FILE,
		item: { id },
		collect: (monitor) => ({
			handlerId: monitor.getHandlerId(),
			isDragging: monitor.isDragging(),
		}),
		end() {
			onHover(undefined);
		}
	});

	const [, connectDrop] = useDrop({
		accept: [ItemTypes.FILE, NativeTypes.FILE],
		hover({ id: dragId }: { id: any; type: string }) {
			onHover(dragId);
			if (dragId && id && dragId !== id) {
				// Allow folders to only drag over other folders
				if (dragId.type !== 'folder' || id.type === 'folder') {
					onMove(dragId, id)
				}
			}
		},
		drop(item: any) {
			onDrop(item)
		}
	});

	connectDrag(ref);
	connectDrop(ref);
	const background = type === 'folder' ? 'lightblue' : 'white'
	const fontWeight = type === 'folder' ? 'bold' : 'normal'
	const opacity = (isDragging || type === 'new') ? 0.2 : 1;
	const marginLeft = type === 'track' ? '20px' : '0';

	return (
		<div ref={ref} style={{...style, background, opacity, marginLeft }} data-handler-id={handlerId}>	
			<span style={{flex: 1, textAlign: 'center', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
				<span
					title={title}
					style={{ fontWeight }}>
					{text}
				</span>
				{type !== 'new' &&
					<button
						title='Rename'
						style={{transform: `scale(-1, 1)`}}
						onClick={() => onRename(id)}>
						✏️
					</button>
				}
			</span>
			<span style={{marginLeft: 'auto', alignContent: 'center'}}>
				{type === 'track' &&
					<button
						title='Downlaod'
						onClick={() => onDownload(id)}>
						⬇
					</button>
				}
				{type !== 'new' &&
					<button
						title='Delete'
						onClick={() => onDelete(id)}>
						🗑
					</button>
				}
			</span>
		</div>
	);
});
