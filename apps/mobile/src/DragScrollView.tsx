import React, { useRef, useEffect } from 'react';
import { ScrollView, Platform } from 'react-native';

// Horizontal carousel that also scrolls via mouse click-and-drag on web (RN Web ScrollViews don't),
// while blocking the native image "ghost" drag and suppressing the click when a drag occurred.
export function DragScrollView({ children, contentContainerStyle }: { children: React.ReactNode; contentContainerStyle?: any }) {
  const ref = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current?.getScrollableNode?.() ?? ref.current;
    if (!node) return;
    let down = false, startX = 0, startLeft = 0, moved = false;
    const onDown = (e: any) => { e.preventDefault?.(); down = true; moved = false; startX = e.pageX; startLeft = node.scrollLeft; node.style.cursor = 'grabbing'; node.style.userSelect = 'none'; };
    const onMove = (e: any) => { if (!down) return; const dx = e.pageX - startX; if (Math.abs(dx) > 3) moved = true; node.scrollLeft = startLeft - dx; };
    const onUp = () => { down = false; node.style.cursor = 'grab'; node.style.userSelect = ''; };
    const onClick = (e: any) => { if (moved) { e.preventDefault(); e.stopPropagation(); } };
    const onDragStart = (e: any) => e.preventDefault();
    node.style.cursor = 'grab';
    node.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    node.addEventListener('click', onClick, true);
    node.addEventListener('dragstart', onDragStart, true);
    return () => { node.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); node.removeEventListener('click', onClick, true); node.removeEventListener('dragstart', onDragStart, true); };
  }, []);
  return <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={contentContainerStyle}>{children}</ScrollView>;
}
