import * as React from "react";
import * as ReactDOM from "react-dom";
import styled from "styled-components";
import { TabLink, ExternalLink, Section, } from "./styles";

const SlimePreview = styled.a<{ width: string }>`
    display: inline-block;
    border: 3px solid #212121;
    height: fit-content;
    width: ${(props) => props.width};
    line-height: 0;
    cursor: pointer;
    transition: border-color 200ms ease;
    &:hover {
        border-color: yellow;
    }
`

const SlimeBoxDesktop = styled.div`
    display: flex;
    padding: 0 0 15 0;
`

const SlimeBoxMobile = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    padding: 0 0 10 0;
`

const SlimeTextMobile = styled.div`
    padding: 5 0 0 0;
`

const SlimeTextDesktop = styled.div`
    display: inline-block;
    padding: 10 10 10 30;
    vertical-align: top;
    width: 50%;
`

const FractalText = styled.div`
    display: inline-block;
`

const FRACTAL_IMAGE_COUNT = 30;
const FRACTAL_AUTO_ADVANCE_MS = 5000;
const FRACTAL_SLIDE_MS = 600;

const CarouselContainer = styled.div<{ height: string }>`
  position: relative;
  width: 100%;
  height: ${(props) => props.height};
  margin: 10px 0;
  user-select: none;
  background: #111;
  overflow: hidden;
`

const CarouselTrack = styled.div<{ offset: number; animate: boolean }>`
  display: flex;
  height: 100%;
  width: 100%;
  transform: translateX(${(props) => -props.offset * 100}%);
  transition: ${(props) => (props.animate ? `transform ${FRACTAL_SLIDE_MS}ms ease` : "none")};
`

const CarouselSlide = styled.div`
  flex: 0 0 100%;
  height: 100%;
`

const CarouselImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  cursor: zoom-in;
`

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
`

const ModalImageWrap = styled.div`
  position: relative;
  display: inline-block;
  line-height: 0;
`

const ModalImage = styled.img`
  max-width: calc(100vw - 100px);
  max-height: calc(100vh - 100px);
  display: block;
  cursor: default;
`

const ModalCloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  font-size: 28px;
  line-height: 1;
  width: 44px;
  height: 44px;
  cursor: pointer;
  z-index: 2;

  &:hover {
    background: rgba(0, 0, 0, 0.9);
  }
`

const ModalArrow = styled.button<{ side: "left" | "right" }>`
  position: absolute;
  top: 0;
  bottom: 0;
  ${(props) => (props.side === "left" ? "right: 100%;" : "left: 100%;")}
  width: 50px;
  background: rgba(0, 0, 0, 0.4);
  border: none;
  color: white;
  font-size: 36px;
  font-weight: bold;
  cursor: pointer;
  transition: background 200ms ease;
  z-index: 2;

  &:hover {
    background: rgba(0, 0, 0, 0.7);
  }
`

const CarouselArrow = styled.button<{ side: "left" | "right" }>`
  position: absolute;
  top: 0;
  bottom: 0;
  ${(props) => props.side}: 0;
  width: 44px;
  background: rgba(0, 0, 0, 0.4);
  border: none;
  color: white;
  font-size: 32px;
  font-weight: bold;
  cursor: pointer;
  transition: background 200ms ease;
  z-index: 2;

  &:hover {
    background: rgba(0, 0, 0, 0.7);
  }
`

const FractalGallery = (props: { isMobile: boolean }) => {
    const { isMobile } = props;
    const [index, setIndex] = React.useState(0);
    const [autoPlay, setAutoPlay] = React.useState(true);
    const [animate, setAnimate] = React.useState(true);
    const [modalOpen, setModalOpen] = React.useState(false);

    const advance = React.useCallback((delta: number, stopAutoplay: boolean) => {
        if (stopAutoplay) setAutoPlay(false);
        setIndex((prev) => {
            const next = prev + delta;
            const wrapped = (next + FRACTAL_IMAGE_COUNT) % FRACTAL_IMAGE_COUNT;
            setAnimate(next >= 0 && next < FRACTAL_IMAGE_COUNT);
            return wrapped;
        });
    }, []);

    const openModal = () => {
        setAutoPlay(false);
        setModalOpen(true);
    };

    const closeModal = () => setModalOpen(false);

    React.useEffect(() => {
        if (!autoPlay) return;
        const id = setInterval(() => advance(1, false), FRACTAL_AUTO_ADVANCE_MS);
        return () => clearInterval(id);
    }, [autoPlay, advance]);

    React.useEffect(() => {
        if (animate) return;
        const handle = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
        return () => cancelAnimationFrame(handle);
    }, [animate]);

    const height = isMobile ? "260px" : "440px";

    return (
        <>
            <CarouselContainer height={height}>
                <CarouselArrow side="left" onClick={() => advance(-1, true)} aria-label="Previous image">‹</CarouselArrow>
                <CarouselTrack offset={index} animate={animate}>
                    {Array.from({ length: FRACTAL_IMAGE_COUNT }, (_, i) => {
                        const src = `PsychoPics/Screenshot (${i + 1}).png`;
                        return (
                            <CarouselSlide key={i}>
                                <CarouselImage src={src} alt={`Fractal sample ${i + 1}`} onClick={openModal} />
                            </CarouselSlide>
                        );
                    })}
                </CarouselTrack>
                <CarouselArrow side="right" onClick={() => advance(1, true)} aria-label="Next image">›</CarouselArrow>
            </CarouselContainer>
            {modalOpen && ReactDOM.createPortal(
                <ModalBackdrop onClick={closeModal}>
                    <ModalImageWrap>
                        <ModalArrow side="left" onClick={(e) => { e.stopPropagation(); advance(-1, true); }} aria-label="Previous image">‹</ModalArrow>
                        <ModalImage src={`PsychoPics/Screenshot (${index + 1}).png`} alt={`Fractal sample ${index + 1}`} onClick={(e) => e.stopPropagation()} />
                        <ModalArrow side="right" onClick={(e) => { e.stopPropagation(); advance(1, true); }} aria-label="Next image">›</ModalArrow>
                    </ModalImageWrap>
                    <ModalCloseButton onClick={closeModal} aria-label="Close">×</ModalCloseButton>
                </ModalBackdrop>,
                document.body
            )}
        </>
    );
}

const videoDimensions = { mobile: { width: "285", height: "150" }, desktop: {width : "500", height : "270"}}

const VideoElement = (props: { isMobile: boolean }) => {
    if (props.isMobile) {
        return (
            <video id="slimeMobile" loop autoPlay muted width={videoDimensions.mobile.width} preload="auto">
                <source src="SlimePreviewCroppedCompress.mp4" type="video/mp4" />
                Your browser does not support this preview video.
            </video>
        );
    }
    return (
        <video id="slimeDesktop" loop autoPlay muted width={videoDimensions.desktop.width} preload="auto">
            <source src="SlimePreviewCroppedCompress.mp4" type="video/mp4" />
        </video>
    );
}

const Art = (props: {
    isMobile: boolean;
    onTabChange?: (tab: string) => void;
    zoomImg?: string;
    setZoomImg?: (img: string) => void;
}) => {
    let { isMobile, onTabChange } = props;

    var slimePreview = (
        <SlimePreview width={isMobile ? "285" : "500"} href="slime/">
            <VideoElement isMobile={isMobile} />
        </SlimePreview>
    );

    var slimeText = (
        <div>
            I wanted to give viewers a sense of scale with this experience, beginning with a very grounded
            visual of "traveling down the road" which gradually increases in scope and becomes more surreal.
            <br /><br />
                    It shows the ways in which Virtual Reality can bend your expectations of what is visually possible, and then break them.
        </div>
    );

    var slimeBoxDesktop = (
        <SlimeBoxDesktop id="deskbox">
            {slimePreview}
            <SlimeTextDesktop>
                {slimeText}
            </SlimeTextDesktop>
        </SlimeBoxDesktop>
    );

    var slimeBoxMobile = (
        <SlimeBoxMobile id="mobilebox">
            {slimePreview}
            <SlimeTextMobile>
                {slimeText}
            </SlimeTextMobile>
        </SlimeBoxMobile>
    );

    return (
        <Section>
            My main creative work has been these audio-visual experiences using various WebXR technologies.
            I love that users can immerse themselves to their comfort level from anywhere.
            <h2>Slime Freighter</h2>
            <b>Slime Freighter</b> is an immersive VR music video set to "Side of the Road" by Big Black Delta.
            <br /><br />
            {isMobile ? slimeBoxMobile : slimeBoxDesktop}
                Assets in this video were handmade using GLSL shaders and WebGL geometry,
                and their placement is procedurally generated in Javascript, so each experience is a bit different.
            <br /><br />
                Nearly everything in the video is synchronized to the beat of the music, using a customized
                audio-reactivity component that I built for the project.
            <h2>Bismuth</h2>
            <FractalText>
                A fun side-effect of the Slime Freighter video was discovering the potential of fractal visualizations using GLSL shaders.
                    <br /><br />
                <b>Bismuth</b> is my attempt to create a visualizer that will always show something new. An interactive preview is available in the {onTabChange ? <TabLink onClick={() => onTabChange("Demo")}>Demo</TabLink> : <b>Demo</b>}. A full, feature-rich version is available on the <ExternalLink href="https://play.google.com/store/apps/details?id=com.algoraphics.bismuth" target="_blank" rel="noopener noreferrer">Google Play Store</ExternalLink>.
                <br /><br />
            </FractalText>
            <FractalGallery isMobile={isMobile} />
        </Section>
    );
}

export default Art;