import * as React from "react";
import styled from "styled-components";
import { Icon } from "./styles";

const ControlButton = styled.button`
    outline: none;
    font-size: 0;
    border: 1px solid;
    background-size: contain;
    background-color: #454545;
    border-color: #454545;
    border-top-width: 2px;
    border-top-color: #454545;
    border-bottom-width: 2px;
    border-bottom-color: #454545;
    &:hover {
        border-color: yellow;
    }
`

const ControlButtonGroup = styled.div<{ isActive: boolean }>`
    opacity: 0;
    top: 40;
    position: fixed;
    display: flex;
    justify-content: center;
    transition: all 0.5s ease;
    transform: scale(0.25);
    transform-origin: top;
    ${(props) => props.isActive &&`
        z-index: 2;
        opacity: 1 !important;
        transform: scale(0.75) !important;
    `};
`


declare global {
    interface Window {
        controlPause?: () => void;
        controlPlay?: () => void;
        controlRewind?: () => void;
        controlFastForward?: () => void;
        controlPowerUp?: () => void;
        controlPowerDown?: () => void;
        controlToggleMouse?: () => void;
        controlRandomJump?: () => void;
        controlFullscreen?: () => void;
        controlToggleUI?: () => void;
    }
}

const controlButtons = [
    { key: "visible", path: "websiteIcons/VisibleWhite.png", hover: "Show/Hide Controls (H)", action: "togglePanel" },
    { key: "rewind", path: "websiteIcons/RewindWhite.png", hover: "Rewind (←)", action: "controlRewind" },
    { key: "pause", path: "websiteIcons/PauseWhite.png", hover: "Pause", action: "controlPause" },
    { key: "play", path: "websiteIcons/PlayWhite.png", hover: "Reset (↓)", action: "controlPlay" },
    { key: "fastForward", path: "websiteIcons/FastForwardWhite.png", hover: "Fast Forward (→)", action: "controlFastForward" },
    { key: "mouse", path: "websiteIcons/MouseWhite.png", hover: "Toggle Cursor Interactivity", action: "controlToggleMouse" },
    { key: "powerDown", path: "websiteIcons/PowerDownWhite.png", hover: "Decrease Complexity", action: "controlPowerDown" },
    { key: "powerUp", path: "websiteIcons/PowerUpWhite.png", hover: "Increase Complexity", action: "controlPowerUp" },
    { key: "random", path: "websiteIcons/random.png", hover: "I'm feeling lucky! (R)", action: "controlRandomJump" },
    { key: "fullscreen", path: "websiteIcons/fullscreen.png", hover: "Fullscreen", action: "controlFullscreen" },
];

const ControlButtons = (props: { isMobile: boolean; isActive: boolean; onTogglePanel: () => void }) => {
    const handleClick = (action: string) => {
        if (action === "togglePanel") {
            props.onTogglePanel();
        } else {
            const fn = window[action as keyof Window];
            if (typeof fn === 'function') {
                fn();
                if (action !== "controlToggleMouse" && action !== "controlPause" && action !== "controlPlay" && 
                    action !== "controlRewind" && action !== "controlFastForward" && 
                    action !== "controlPowerUp" && action !== "controlPowerDown") {
                    document.dispatchEvent(new CustomEvent('hideExplanationPanel'));
                }
            }
        }
    };

    return (
        <ControlButtonGroup id="controlbuttons" isActive={props.isActive}>
            {controlButtons.map((btn) => (
                <ControlButton key={btn.key} onClick={() => handleClick(btn.action)}>
                    {btn.hover}
                    <Icon src={btn.path} title={btn.hover} height={props.isMobile ? "25px" : "40px"} />
                </ControlButton>
            ))}
        </ControlButtonGroup>
    )
}


const ControlPanel = (props: { isMobile: boolean; isActive: boolean; onTogglePanel: () => void }) => {
    const { isMobile, isActive, onTogglePanel } = props;
    return (
        <ControlButtons isMobile={isMobile} isActive={isActive} onTogglePanel={onTogglePanel} />
    );
}

export default ControlPanel;