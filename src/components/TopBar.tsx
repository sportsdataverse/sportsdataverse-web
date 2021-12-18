import React, { ReactElement, useContext } from 'react'
import Toolbar from '@material-ui/core/Toolbar'
import SunIcon from '@material-ui/icons/WbSunnyOutlined'
import ViewHeadlineIcon from '@material-ui/icons/ViewHeadline'
import MoonIcon from '@material-ui/icons/Brightness2Outlined'
import CustomDropdown from '../components/CustomDropdown/CustomDropdown';
import CodeIcon from '@material-ui/icons/Code'
import AccountTreeIcon from '@material-ui/icons/AccountTree';
import IconButton from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography'
import Button from '@material-ui/core/Button'
import AppBar from '@material-ui/core/AppBar'
import useScrollTrigger from '@material-ui/core/useScrollTrigger'
import { makeStyles } from '@material-ui/core/styles'
import { ToggleThemeContext } from '../theme'
import Link from 'next/link'
import { Tooltip } from '@material-ui/core'
import { NAME_AND_DOMAIN } from '../types/constants'
import Image from 'next/image'
import {
  container,
  hexToRGBAlpha,
  defaultFont,
  primaryColor,
  infoColor,
  successColor,
  warningColor,
  dangerColor,
  roseColor,
  transition,
  boxShadow,
  drawerWidth
} from '../../assets/jss/nextjs-material-kit.js';
const useStyles = makeStyles({
  appBar: {
    display: 'flex',
    border: '0',
    borderRadius: '3px',
    padding: '0.3125rem 0',
    marginBottom: '10px',
    color: '#7B1729',
    width: '100%',
    backgroundColor: '#7B1729',
    boxShadow:
      '0 2px 10px 0px rgba(0, 0, 0, 0.12), 0 5px 7px -5px rgba(0, 0, 0, 0.15)',
    transition: 'all 150ms ease 0s',
    alignItems: 'center',
    flexFlow: 'row wrap',
    justifyContent: 'flex-start',
    position: 'relative',
    zIndex: 'unset'
  },
  absolute: {
    position: 'absolute'
  },
  fixed: {
    position: 'fixed'
  },
  show: {
    transform: 'translateY(0)',
    transition: 'transform .5s',
  },
  hide: {
    transform: 'translateY(-110%)',
    transition: 'transform .5s',
  },
  toolbar: {
    paddingLeft: '1%',
  },
  toolbarContent: {
    paddingLeft: 10,
  },
  toolbarRight: {
    right: 0,
    position: 'relative',
    paddingRight: '1%',
  },
  container: {
    ...container,
    minHeight: '45px',
    flex: '1',
    alignItems: 'center',
    justifyContent: 'space-between',
    display: 'flex',
    flexWrap: 'nowrap'
  },
})

export const TopBar = (): ReactElement => {
  const trigger = useScrollTrigger()
  const classes = useStyles()
  const { toggleTheme, isDark } = useContext(ToggleThemeContext)

  return (
    <AppBar className={trigger ? classes.hide : classes.show} position='sticky'>
      <Toolbar className={classes.toolbar}>
        <div className={classes.toolbarContent}>
        <Link href='https://sportsdataverse.org/' passHref>
            <Image
              src='/logo/logo.png'
              width='80px'
              height='40px'
              alt='sportsdataverse.org'
            />
        </Link>
        </div>
        <div className={classes.toolbarContent}>
        <CustomDropdown
            noLiPadding
            navDropdown
            buttonText="Packages"
            buttonProps={{
              color: "transparent"
            }}
            buttonIcon={AccountTreeIcon}
            dropdownList={[
              <a className={classes.toolbarContent}><strong>Python</strong></a>,
              <Link href="https://py.sportsdataverse.org/" passHref>
                <a href="https://py.sportsdataverse.org/"
                className={classes.toolbarContent}>sportsdataverse</a>
              </Link>,
              <a className={classes.toolbarContent}><strong>R</strong></a>,
              <Link href="https://saiemgilani.github.io/cfbfastR/" passHref>
                <a href="https://saiemgilani.github.io/cfbfastR/"
                 className={classes.toolbarContent}>cfbfastR</a>
              </Link>,
              <Link href="https://saiemgilani.github.io/hoopR/" passHref>
                <a href="https://saiemgilani.github.io/hoopR/"
                 className={classes.toolbarContent}>hoopR</a>
              </Link>,
              <Link href="https://saiemgilani.github.io/wehoop/" passHref>
                <a href="https://saiemgilani.github.io/wehoop/"
                className={classes.toolbarContent}>wehoop</a>
              </Link>,
              <Link href="https://saiemgilani.github.io/recruitR/" passHref>
                <a href="https://saiemgilani.github.io/recruitR/"
                 className={classes.toolbarContent}>recruitR</a>
              </Link>,
              <Link href="https://puntalytics.github.io/puntr/" passHref>
                <a href="https://puntalytics.github.io/puntr/"
                 className={classes.toolbarContent}>puntr</a>
              </Link>,
              <Link href="https://jacklich10.github.io/gamezoneR/" passHref>
                <a href="https://jacklich10.github.io/gamezoneR/"
                  target="_blank"
                  rel="noreferrer"
                  className={classes.toolbarContent}>gamezoneR</a>
              </Link>,
              <Link href="https://kazink36.github.io/cfbplotR/" passHref>
                <a href="https://kazink36.github.io/cfbplotR/"
                 className={classes.toolbarContent}>cfbplotR</a>
              </Link>,
              <Link href="https://kazink36.github.io/cfb4th/" passHref>
                <a href="https://kazink36.github.io/cfb4th/"
                 className={classes.toolbarContent}>cfb4th</a>
              </Link>,
              <Link href="https://jaseziv.github.io/worldfootballR/" passHref>
                <a href="https://jaseziv.github.io/worldfootballR/"
                 className={classes.toolbarContent}>worldfootballR</a>
              </Link>,
              <Link href="https://BillPetti.github.io/baseballr/" passHref>
                <a href="https://BillPetti.github.io/baseballr/"
                 className={classes.toolbarContent}>baseballr</a>
              </Link>,
              <Link href="https://BenHowell71.github.io/fastRhockey/" passHref>
                <a href="https://BenHowell71.github.io/fastRhockey/"
                 className={classes.toolbarContent}>fastRhockey</a>
              </Link>,
              <a className={classes.toolbarContent}><strong>Node.js</strong></a>,
              <Link href="https://saiemgilani.github.io/sportsdataverse" passHref>
                <a
                  href="https://saiemgilani.github.io/sportsdataverse"
                  className={classes.toolbarContent}
                > sportsdataverse.js
                </a>
              </Link>,
              <Link href="https://github.com/nntrn/nfl-nerd/" passHref>
                <a href="https://github.com/nntrn/nfl-nerd/"
                 className={classes.toolbarContent}>nfl-nerd</a>
              </Link>
            ]}
          />
        </div>
        <div className={classes.toolbarContent}>
          <Link href='/blog' passHref>
            <Button variant='text' color='inherit'>
              <ViewHeadlineIcon />
              &nbsp;Blog
            </Button>
          </Link>
        </div>
        <div className={classes.toolbarRight}>
          <Tooltip title='Toggle Theme'>
            <Button variant='text' color='inherit' onClick={toggleTheme}>
              {isDark ? <SunIcon /> : <MoonIcon />}
            </Button>
          </Tooltip>
        </div>
      </Toolbar>
    </AppBar>
  )
}

export default TopBar
