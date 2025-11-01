import * as React from "react";
import styled from "styled-components";
import { TabLink, Section, } from "./styles";

const SlimePreview = styled.div<{ width: string }>`
    display: inline-block;
    border-style: solid;
    border-color: #212121;
    height: fit-content;
    width: ${(props) => props.width};
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

const FractalBox = styled.div`
  padding: 10px;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
`

const FractalImg = styled.img<{ isZoom: boolean; zoomType: string }>`
  user-select: none;
  flex: 0 9%;
  margin-bottom: 2%;
  transition: transform 0.5s ease-in-out;
  ${(props) => props.isZoom && props.zoomType};
`


const FractalGallery = (props: { isMobile: boolean; zoomImg: string; setZoomImg: (img: string) => void }) => {
    const { isMobile, zoomImg, setZoomImg } = props;
    const targetProp = isMobile ? "transform: scale(3);" : "transform: scale(6);";

    const images = [];
    for (let i = 1; i <= 30; ++i) {
        if (isMobile) {
            i++;
        }
        let path = "PsychoPics/Screenshot (" + i + ").png";
        let id = "fractalImg" + i;
        images.push(<FractalImg key={i} id={id} src={path} height={isMobile ? "160" : "100"} zoomType={targetProp}
            onClick={(e) => { 
                e.stopPropagation();
                (zoomImg === id) ? setZoomImg("none") : setZoomImg(id);
            }} 
            isZoom={zoomImg === id} />);
    }
    return (
        <FractalBox>
            {images}
        </FractalBox>
    );
}

const videoDimensions = { mobile: { width: "285", height: "150" }, desktop: {width : "500", height : "270"}}

const VideoElement = (props: { isMobile: boolean }) => {
    if (props.isMobile) {
        return (
            <video id="slimeMobile" loop autoPlay muted height={videoDimensions.mobile.height} width={videoDimensions.mobile.width} preload="auto">
                <source src="SlimePreviewCroppedCompress.mp4" type="video/mp4" />
                Your browser does not support this preview video.
            </video>
        );
    }
    return (
        <video id="slimeDesktop" loop autoPlay muted height={videoDimensions.desktop.height} width={videoDimensions.desktop.width} preload="auto">
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
    let { isMobile, onTabChange, zoomImg = "none", setZoomImg = () => {} } = props;

    var slimePreview = (
        <SlimePreview width={isMobile ? "285" : "500"}>
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
            <h2>Opal & Bismuth</h2>
            <FractalText>
                A fun side-effect of the Slime Freighter video was discovering the potential of fractal visualizations using GLSL shaders.
                    <br /><br />
                <b>Opal & Bismuth</b> are my attempt to create a visualizer that will always show something new.
                    They use the same basic algorithms, but Opal is based on circular geometry while Bismuth is rectangular.
                    <br /><br />
                    An interactive Bismuth preview is available in the {onTabChange ? <TabLink onClick={() => onTabChange("Demo")}>Demo</TabLink> : <b>Demo</b>}, or you can browse the gallery below to see samples of both visualizers. <b> Click to Zoom! </b>
                <br /><br />
            </FractalText>
            <FractalGallery isMobile={isMobile} zoomImg={zoomImg} setZoomImg={setZoomImg} />
        </Section>
    );
}

export default Art;