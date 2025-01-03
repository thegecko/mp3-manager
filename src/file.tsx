import { memo, useMemo, useRef } from 'preact/compat'
import { useDrag, useDrop } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'

const ItemTypes = {
	CARD: 'card',
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
}

export const File = memo((props: FileProps) => {
	const ref = useRef(null)
	const [{ isDragging, handlerId }, connectDrag] = useDrag({
		type: ItemTypes.CARD,
		item: { id: props.id },
		collect: (monitor) => {
			const result = {
				handlerId: monitor.getHandlerId(),
				isDragging: monitor.isDragging(),
			}
			return result
		},
	})

	const [, connectDrop] = useDrop({
		accept: [ItemTypes.CARD, NativeTypes.FILE],
		hover({ id: dragId }: { id: any; type: string }) {
			if (dragId && props.id && dragId !== props.id) {
				props.onMove(dragId, props.id)
			}
		},
	})

	connectDrag(ref)
	connectDrop(ref)
	const opacity = (isDragging || props.isNew) ? 0.2 : 1
	const containerStyle = useMemo(() => ({ ...style, opacity }), [opacity])
	return (
		<div ref={ref} style={containerStyle} data-handler-id={handlerId}>
			{props.text}
		</div>
	)
});
