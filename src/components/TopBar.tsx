import React, { ReactElement, useContext } from 'react'
import Toolbar from '@material-ui/core/Toolbar'
import SunIcon from '@material-ui/icons/WbSunnyOutlined'
import ViewHeadlineIcon from '@material-ui/icons/ViewHeadline'
import MoonIcon from '@material-ui/icons/Brightness2Outlined'
import CodeIcon from '@material-ui/icons/Code'
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
    padding: '0.625rem 0',
    marginBottom: '20px',
    color: '#7B1729',
    width: '100%',
    backgroundColor: '#7B1729',
    boxShadow:
      '0 4px 18px 0px rgba(0, 0, 0, 0.12), 0 7px 10px -5px rgba(0, 0, 0, 0.15)',
    transition: 'all 150ms ease 0s',
    alignItems: 'center',
    flexFlow: 'row nowrap',
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
    paddingLeft: '5%',
  },
  toolbarContent: {
    paddingLeft: 70,
  },
  toolbarRight: {
    right: 0,
    position: 'absolute',
    paddingRight: '5%',
  },
  container: {
    ...container,
    minHeight: '50px',
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
        <Link href='https://sportsdataverse.org'>
            <Image
              src='/logo/logo.png'
              width='80px'
              height='40px'
              alt='sportsdataverse.org'
            />
        </Link>
        <div className={classes.toolbarContent}>
          <Link href='/blog'>
            <Button variant='text' color='inherit'>
              <ViewHeadlineIcon />
              &nbsp;Blog
            </Button>
          </Link>
          <Link href='/topics'>
            <Button variant='text' color='inherit'>
              <CodeIcon />
              &nbsp;Topics
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
