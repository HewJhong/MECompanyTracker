import React, { useState, useRef, useEffect, ReactNode } from 'react';

interface TooltipProps {
    text: string;
    children: ReactNode;
    delay?: number;
}

export default function Tooltip({ text, children, delay = 50 }: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        timeoutRef.current = setTimeout(() => {
            setIsVisible(true);
            setStyle({
                opacity: 0,
                left: '50%',
                top: '100%',
                transform: 'translateX(-50%)'
            });
        }, delay);
    };

    useEffect(() => {
        if (!isVisible || !triggerRef.current || !tooltipRef.current) return;

        let rect = triggerRef.current.getBoundingClientRect();
        const containerRect = rect;

        // Try to get the exact bounds of the text instead of the flex container
        try {
            const textElement = triggerRef.current.firstElementChild;
            if (textElement && textElement.firstChild && textElement.firstChild.nodeType === Node.TEXT_NODE) {
                const range = document.createRange();
                range.selectNodeContents(textElement.firstChild);
                const textRect = range.getBoundingClientRect();

                if (textRect.width > 0 && textRect.width < rect.width) {
                    rect = textRect;
                }
            }
        } catch (e) {
            console.warn("Could not get text node bounds for tooltip alignment.");
        }

        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width;
        const halfTooltipWidth = tooltipWidth / 2;

        const spaceAbove = rect.top;
        const tooltipHeight = tooltipRect.height || 40;
        const positionAbove = spaceAbove > tooltipHeight + 10;

        const triggerCenter = rect.left + (rect.width / 2);
        const centerOffsetPx = triggerCenter - containerRect.left;

        let finalLeft = `${centerOffsetPx}px`;
        let transform = 'translateX(-50%)';

        const EDGE_PADDING = 16;

        if (triggerCenter - halfTooltipWidth < EDGE_PADDING) {
            // Overflows left screen edge
            const offset = EDGE_PADDING - containerRect.left;
            finalLeft = `${offset}px`;
            transform = 'none';
        } else if (triggerCenter + halfTooltipWidth > window.innerWidth - EDGE_PADDING) {
            // Overflows right screen edge
            const offset = (window.innerWidth - EDGE_PADDING - tooltipWidth) - containerRect.left;
            finalLeft = `${offset}px`;
            transform = 'none';
        }

        setStyle({
            opacity: 1,
            left: finalLeft,
            transform,
            bottom: positionAbove ? '100%' : 'auto',
            top: positionAbove ? 'auto' : '100%',
            marginBottom: positionAbove ? '8px' : '0',
            marginTop: positionAbove ? '0' : '8px',
        });
    }, [isVisible, text]);

    const handleMouseLeave = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setIsVisible(false);
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    // Also support dismissing on click for mobile
    const handleClick = () => {
        setIsVisible(!isVisible);
    };

    return (
        <div
            className="relative flex items-center min-w-0"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            ref={triggerRef}
        >
            {children}
            {isVisible && text && (
                <div
                    ref={tooltipRef}
                    className="absolute z-50 px-2 py-1 text-xs font-medium text-white bg-slate-800 rounded shadow-sm whitespace-normal min-w-max max-w-[200px] sm:max-w-xs break-words transition-opacity duration-75"
                    style={style}
                >
                    {text}
                </div>
            )}
        </div>
    );
}
