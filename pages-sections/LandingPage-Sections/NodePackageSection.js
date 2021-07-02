import React from 'react';
// nodejs library that concatenates classes
import classNames from 'classnames';
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
import Link from 'next/link'
import Image from 'next/image'

// @material-ui/icons

// core components
import GridContainer from '../../src/components/Grid/GridContainer.js';
import GridItem from '../../src/components/Grid/GridItem.js';
import Button from '../../src/components/CustomButtons/Button.js';
import Card from '../../src/components/Card/Card.js';
import CardBody from '../../src/components/Card/CardBody.js';
import CardFooter from '../../src/components/Card/CardFooter.js';

import styles from '../../assets/jss/nextjs-material-kit/pages/landingPageSections/nodePackageStyle.js';


const useStyles = makeStyles(styles);

export default function PackageSection() {
  const classes = useStyles();
  const imageClasses = classNames(
    classes.imgRaised,
    classes.imgRoundedCircle,
    classes.imgFluid
  );
  return (
    <div className={classes.section}>
      <h2 className={classes.title}>Node.js modules in SportsDataverse:</h2>
      <div>
        <GridContainer>
          <GridItem xs={12} sm={12} md={3}>
            <Card plain>
              <GridItem xs={12} sm={12} md={6} className={classes.itemGrid}>
              </GridItem>
              <CardBody>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={6}>
            <Card plain>
              <GridItem xs={12} sm={12} md={12} className={classes.itemGrid}>
                <Link href='https://saiemgilani.github.io/sportsdataverse/'>
                  <Image 
                  src={`/images/sportsdataverse-node.png`} 
                  alt='sportsdataverse-node-js'
                  height ={300}
                  width ={600} />
                </Link>
              </GridItem>
              <h4 className={classes.cardTitle}>
              <Link href='https://saiemgilani.github.io/sportsdataverse/'>sportsdataverse</Link>
                <br />
                <small className={classes.smallTitle}>All collegiate and 6 Professional sports - Node.js</small>
              </h4>
              <CardBody>
              <h4 className={classes.description}>
                Support for the following types of data from ESPN's endpoints: play-by-play (including shot location data when available), scores, schedule, standings, and rankings (not available for professional sports).
              </h4>
                <p className={classes.description}>
                Recruiting data from 247Sports available for: men's college basketball and college football.
                </p>
                <p className={classes.description}>
                The following sports are available from ESPN: College Basketball, Women's College Basketball,
                College Football, WNBA, NBA, NFL, and the NHL.
                </p>
                <p className={classes.description}>
                All team sports on the NCAA website: 'football', 'basketball-men', 'basketball-women', 'soccer-men', 'soccer-women',
                'fieldhockey', 'volleyball-women', 'icehockey-men', 'icehockey-women', 'baseball',
                'beach-volleyball', 'lacrosse-men', 'lacrosse-women', 'volleyball-men'
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={3}>
            <Card plain>
              <GridItem xs={12} sm={12} md={6} className={classes.itemGrid}>
              </GridItem>
              <CardBody>
              </CardBody>
            </Card>
          </GridItem>
        </GridContainer>
      </div>
    </div>
  );
}
