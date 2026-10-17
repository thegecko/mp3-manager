import { useRef } from 'preact/hooks'
import { memo } from 'preact/compat'
import { useDrag, useDrop } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'
import { actionButtonStyle, actionsStyle, artistStyle, dangerButtonStyle, fileStyle, titleWrapStyle } from '../styles'

const ItemTypes = {
	FILE: 'file',
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
	onAdd: (id: any) => void;
	onYank: (id: any) => void;
}

export const File = memo((props: FileProps) => {
	const { id, type, text, title, onHover, onMove, onDrop, onDelete, onRename, onDownload, onAdd, onYank } = props
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
	const fontWeight = type === 'folder' ? 'bold' : 'normal'
	const opacity = (isDragging || type === 'new') ? 0.2 : 1;
	const marginLeft = type !== 'folder' ? '24px' : '0';
	const paddingLeft = type !== 'folder' ? '1.2rem' : '0.85rem';
	const background = type === 'folder' ? '#d6e9ff' : type === 'new' ? '#fff7dd' : '#ffffff';
	const borderColor = type === 'folder' ? '#9fc7ef' : '#d7e3ef';

	return (
		<div ref={ref} style={{...fileStyle, background, opacity, marginLeft, paddingLeft, borderColor }} data-handler-id={handlerId}>	
			<span style={titleWrapStyle}>
				<span
					title={title}
					style={{ fontWeight, color: type === 'folder' ? '#244f7f' : '#26384f' }}>
					{text}
				</span>
				{title && type !== 'folder' && <span style={artistStyle}>{title}</span>}
				{type !== 'new' &&
					<button
						title='Rename'
						style={actionButtonStyle}
						onClick={() => onRename(id)}>
						Edit
					</button>
				}
			</span>
			<span style={actionsStyle}>
				{type === 'folder' &&
					<button
						title='Add Track'
						style={actionButtonStyle}
						onClick={() => onAdd(id)}>
						Add
					</button>
				}
				{type === 'folder' &&
					<button
						title='Yank Track (experimental)'
						style={actionButtonStyle}
						onClick={() => onYank(id)}>
						Yank
					</button>
				}
				{type !== 'new' &&
					<button
						title={type === 'folder' ? 'Download Folder' : 'Download Track'}
						style={actionButtonStyle}
						onClick={() => onDownload(id)}>
						⬇
					</button>
				}
				<button
					title='Delete'
					style={dangerButtonStyle}
					onClick={() => onDelete(id)}>
					Delete
				</button>
			</span>
		</div>
	);
});
