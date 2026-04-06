import React, { useState, useRef, useCallback } from "react";
import styled from "styled-components";
import './styles.css';
import AboutMe from './AboutMe';
import Work from './Work';
import Art from './Art';
import ControlPanel from './ControlPanel';
import { Demo } from './Demo';
import { FullWindow, Window, TabPage, Tab, TabButtons, FixedButtons } from './styles';

declare global {
    interface Window {
        controlActivateDemo?: () => void;
        controlDeactivateDemo?: () => void;
    }
}

const getMainWindow = (
    topic: string,
    isMobile: boolean,
    onTabChange: (tab: string) => void,
    zoomImg: string,
    setZoomImg: (img: string) => void
) => {
    if (topic === "Me") {
        return <AboutMe isMobile={isMobile} onTabChange={onTabChange} />
    }
    if (topic === "Work") {
        return <Work isMobile={isMobile} />
    }
    if (topic === "Art") {
        return <Art isMobile={isMobile} onTabChange={onTabChange} zoomImg={zoomImg} setZoomImg={setZoomImg} />
    }
    return <>{topic}</>;
}

const tabs = ["Me", "Work", "Art", "Demo"];

const TRANSITION_MS = 250;

const TabContent = styled.div<{ visible: boolean; duration?: number }>`
    transition: opacity ${(props) => props.duration ?? TRANSITION_MS}ms ease;
    opacity: ${(props) => props.visible ? 1 : 0};
`;

/* Manage current tab and control panel display */
const TabGroup = (props: { isMobile: boolean; zoomImg: string; setZoomImg: (img: string) => void }) => {
    const [activeTab, setActiveTab] = useState(tabs[0]);
    const [displayedTab, setDisplayedTab] = useState(tabs[0]);
    const [transitioning, setTransitioning] = useState(false);
    const [activeDemo, setActiveDemo] = useState(false);
    const { zoomImg, setZoomImg } = props;
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
        const handleHidePanel = () => {
            setActiveDemo(true);
        };
        document.addEventListener("hideExplanationPanel", handleHidePanel);
        return () => {
            document.removeEventListener("hideExplanationPanel", handleHidePanel);
        };
    }, []);

    const handleTogglePanel = () => {
        setActiveDemo(prev => !prev);
    };

    const clearAnimationState = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }, []);

    const handleTabChange = useCallback((tab: string) => {
        if (tab === activeTab) return;

        clearAnimationState();

        if (tab === "Demo") {
            window.controlActivateDemo?.();
        } else {
            setActiveDemo(false);
            window.controlDeactivateDemo?.();
        }

        setActiveTab(tab);
        setTransitioning(true);
        const transitionMs = TRANSITION_MS;
        timeoutRef.current = setTimeout(() => {
            setDisplayedTab(tab);
            if (activeTab === "Demo" && tab !== "Demo") {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => setTransitioning(false));
                });
            } else {
                setTransitioning(false);
            }
        }, transitionMs);
    }, [activeTab, clearAnimationState]);
    
    return (
        <TabPage id="window" maxWidth={props.isMobile ? "625px" : "1200px"}>
            <TabButtons className="tab-buttons">
                <FixedButtons>
                    {tabs.map((type) => (
                        <Tab
                            padding={props.isMobile ? "8 12" : "8 20"}
                            border={props.isMobile ? "solid" : "none"}
                            key={type}
                            activeTab={activeTab === type}
                            onClick={() => handleTabChange(type)}
                        >
                            {type}
                        </Tab>
                    ))}
                </FixedButtons>
                <ControlPanel isMobile={props.isMobile} isActive={activeTab === "Demo"} onTogglePanel={handleTogglePanel}/>
            </TabButtons>
            <br />
            {(displayedTab === "Demo" || activeTab === "Demo") ? (
                <TabContent visible={!transitioning}>
                    {displayedTab !== "Demo" ? (
                        <Window id="tabwindow" fontSize={props.isMobile ? "14px" : "17px"} radius={props.isMobile ? "0%" : "2%"} demoActive={false}>
                            {getMainWindow(displayedTab, props.isMobile, handleTabChange, zoomImg, setZoomImg)}
                        </Window>
                    ) : (
                        <Window id="tabwindow" fontSize={props.isMobile ? "14px" : "17px"} radius={props.isMobile ? "0%" : "2%"} demoActive={activeDemo}>
                            <Demo isMobile={props.isMobile} onTabChange={handleTabChange} />
                        </Window>
                    )}
                </TabContent>
            ) : (
                <Window id="tabwindow" fontSize={props.isMobile ? "14px" : "17px"} radius={props.isMobile ? "0%" : "2%"} demoActive={false}>
                    <TabContent visible={!transitioning}>
                        {getMainWindow(displayedTab, props.isMobile, handleTabChange, zoomImg, setZoomImg)}
                    </TabContent>
                </Window>
            )}
        </TabPage>
    );
}

/* Track full page width to determine if we should resize for mobile */
const WebsiteContainer = () => {
    const [dimensions, setDimensions] = React.useState({
        height: window.innerHeight,
        width: window.innerWidth
    })
    const [zoomImg, setZoomImg] = useState("none");

    React.useEffect(() => {
        function handleResize() {
            setDimensions({
                height: window.innerHeight,
                width: window.innerWidth
            })
        }

        function handleClick() {
            setZoomImg("none");
        }

        window.addEventListener('resize', handleResize)
        document.addEventListener('click', handleClick)

        return () => {
            window.removeEventListener('resize', handleResize)
            document.removeEventListener('click', handleClick)
        }
    }, [])

    const isMobile = dimensions.width <= 1000;
    return (
        <>
            <FullWindow id="FullWindow">
                <TabGroup isMobile={isMobile} zoomImg={zoomImg} setZoomImg={setZoomImg} />
            </FullWindow>
        </>
    );
}

export class Website extends React.Component {
    render() {
        return <WebsiteContainer/>
    }
}