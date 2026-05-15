import styled from "styled-components";

export const TabLink = styled.span`
    font-weight: bold;
    color: yellow;
    cursor: pointer;
    text-decoration: underline;
    &:hover {
        color: goldenrod;
    }
`;

export const ExternalLink = styled.a`
    color: yellow;
    text-decoration: underline;
    &:visited {
        color: goldenrod;
    }
    &:hover {
        color: goldenrod;
    }
    &:visited:hover {
        color: darkgoldenrod;
    }
`;

export const Section = styled.div`
    display: block;
    flex-justify: center;
    flex-direction: column;
`;

export const TextSection = styled.div`
    padding: 5 5 0 5;

    br + br {
        line-height: 0.6;
    }
`;

export const FlexSection = styled.div`
    display: flex;
    flex-justify: center;
    padding: 10px;
`;

export const RoundedImage = styled.img`
    padding: 10px;
    border-radius: 10%;
`;

export const CenteredImage = styled(RoundedImage)`
    margin: 0 auto;
    display: block;
`;

export const Icon = styled.img`
    padding: 5px;
`;

export const FullWindow = styled.div`
  padding: 0 0 250 0;
  position: relative;
  z-index: 1;
`;

export const Window = styled.div<{ fontSize: string; radius: string; demoActive: boolean; translucent?: boolean }>`
  background-color: rgba(33, 33, 33, 0.85);
  backdrop-filter: blur(8px);
  color: white;
  font-size: ${(props) => props.fontSize};
  padding: 40 25;
  max-width: 75%;
  margin: auto;
  border-radius: ${(props) => props.radius};
  transition: opacity 1s ease, height 300ms ease, width 300ms ease;
  overflow: hidden;
  transform-origin: top;
  ${(props) => props.demoActive && `    
    opacity: 0 !important;
  `};
`;

export const TabPage = styled.div<{ maxWidth: string }>`
  max-width: ${(props) => props.maxWidth};
  min-height: 100vh;
`;

export const Tab = styled.button<{ padding: string; border: string; activeTab: boolean }>`
  padding: ${(props) => props.padding};
  font-family: 'Montserrat', sans-serif;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  border-width: thin;
  border-style: ${(props) => props.border};
  outline: 0;
  background: #575757;
  color: white;
  white-space: nowrap;
  border-bottom: 2px solid;
  border-color: #575757;
  transition: background 250ms ease, color 250ms ease, border-color 250ms ease;
  &:hover {
    border-color: yellow;
  }
  ${({ activeTab }) =>
        activeTab &&
        `
    background: yellow;
    color: black;
    border: 0;
  `}
`;

export const TabButtons = styled.div`
    display: flex;
    justify-content: center;
`;

export const FixedButtons = styled.div`
    z-index: 5;
    position: fixed;
    top: 0;

    & > button:first-child {
        border-bottom-left-radius: 4px;
    }
    & > button:last-child {
        border-bottom-right-radius: 4px;
    }
`;

