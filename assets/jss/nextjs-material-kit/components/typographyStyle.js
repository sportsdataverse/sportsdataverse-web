import {
  defaultFont,
  primaryColor,
  infoColor,
  successColor,
  warningColor,
  dangerColor
} from "assets/jss/nextjs-material-kit.js";

const typographyStyle = {
  defaultFontStyle: {
    ...defaultFont,
    fontSize: "24px"
  },
  defaultHeaderMargins: {
    marginTop: "24px",
    marginBottom: "10px"
  },
  quote: {
    padding: "10px 10px",
    margin: "0 0 10px",
    fontSize: "17.5px",
    borderLeft: "5px solid #eee"
  },
  quoteText: {
    margin: "0 0 10px",
    fontStyle: "italic"
  },
  quoteAuthor: {
    display: "block",
    fontSize: "80%",
    lineHeight: "1.42857143",
    color: "#777"
  },
  mutedText: {
    color: "#777"
  },
  primaryText: {
    color: primaryColor
  },
  infoText: {
    color: infoColor
  },
  successText: {
    color: successColor
  },
  warningText: {
    color: warningColor
  },
  dangerText: {
    color: dangerColor
  },
  smallText: {
    fontSize: "85%",
    fontWeight: "400",
    lineHeight: "1",
    color: "#777"
  }
};

export default typographyStyle;
