import type { FC } from 'preact/compat'
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

export interface CardProps {
	id: any;
	text: string;
	isNew?: boolean;
	onMove: (dragRef: any, hoverRef: any) => void;
}

export const Card: FC<CardProps> = memo(function Card({ id, text, isNew, onMove }) {
	const ref = useRef(null)
	const [{ isDragging, handlerId }, connectDrag] = useDrag({
		type: ItemTypes.CARD,
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
		accept: [ItemTypes.CARD, NativeTypes.FILE],
		hover({ id: dragId }: { id: any; type: string }) {
			if (dragId && id && dragId !== id) {
				onMove(dragId, id)
			}
		},
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
})
