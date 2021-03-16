import React from "react";
// nodejs library that concatenates classes
import classNames from "classnames";
// @material-ui/core components
import { makeStyles } from "@material-ui/core/styles";

// @material-ui/icons

// core components
import { Footer } from "../src/components/Footer";
import { Grid, Typography } from '@material-ui/core'
import useMediaQuery from '@material-ui/core/useMediaQuery'
import Box from '@material-ui/core/Box'
import Button from "../src/components/CustomButtons/Button.js";
import Parallax from "../src/components/Parallax/Parallax.js";
import Head from 'next/head'
import styles from '../styles/Shared.module.css'
import { NAME, NAME_AND_DOMAIN } from '../src/types/constants'

// Sections for this page
import NodePackageSection from "../pages-sections/LandingPage-Sections/NodePackageSection.js";
import ProductSection from "../pages-sections/LandingPage-Sections/ProductSection.js";
import PackageSection from "../pages-sections/LandingPage-Sections/PackageSection.js";
import WorkSection from "../pages-sections/LandingPage-Sections/WorkSection.js";



export default function LandingPage(props) {
  const large = useMediaQuery('(min-width:700px)')
  const { ...rest } = props;
  return (
      <>
        <Head>
          <title>{NAME}: Building the SportsDataverse</title>
          <meta
            name="description"
            content={`${NAME} is the homepage of the SportsDataverse.`}
          />
        </Head>
        <Grid container>
          <Grid item xs={12} className={styles.headings}>
            <Box p={5}>
              <Typography variant={large ? 'h1' : 'h4'}>{NAME_AND_DOMAIN}</Typography>
              <Typography className={styles.secondHeading} variant={large ? 'h3' : 'h6'}>
              Building the SportsDataverse.
              </Typography>
            </Box>
          </Grid>
          </Grid>
      <div className={classNames(styles.main, styles.mainRaised)}>
        <div className={styles.headings}>
          <PackageSection />
          <NodePackageSection />
          <ProductSection />
          <WorkSection />
        </div>
      </div>
      <Footer />
    </>
  );
}
