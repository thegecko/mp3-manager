import { useMemo, useRef } from 'preact/hooks'
import { memo } from 'preact/compat'
import { useDrag, useDrop } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'

const ItemTypes = {
	FILE: 'file',
}

const style = {
	cursor: 'move',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
	overflow: 'hidden',
	padding: '0.1rem',
	margin: '.2rem',
	border: '1px solid gray',
	background: 'white',
}

export interface FileProps {
	id: any;
	text: string;
	isNew?: boolean;
	onMove: (dragRef: any, hoverRef: any) => void;
	onDrop: (item: any) => void
}

export const File = memo((props: FileProps) => {
	const ref = useRef(null)
	const { id, text, isNew, onMove, onDrop } = props

	const [{ isDragging, handlerId }, connectDrag] = useDrag({
		type: ItemTypes.FILE,
		item: { id },
		collect: (monitor) => {
			const result = {
				handlerId: monitor.getHandlerId(),
				isDragging: monitor.isDragging(),
			}
			return result
		},
	})

	const [, connectDrop] = useDrop({
		accept: [ItemTypes.FILE, NativeTypes.FILE],
		hover({ id: dragId }: { id: any; type: string }) {
			if (dragId && id && dragId !== id) {
				onMove(dragId, id)
			}
		},
		drop(item: any) {
			onDrop(item)
		}
	})

	connectDrag(ref)
	connectDrop(ref)
	const opacity = (isDragging || isNew) ? 0.2 : 1
	const containerStyle = useMemo(() => ({ ...style, opacity }), [opacity])
	return (
		<div ref={ref} style={containerStyle} data-handler-id={handlerId}>
			{text}
		</div>
	)
});
