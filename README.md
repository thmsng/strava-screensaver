# Strava Live Wallpaper

Your Strava runs replayed as ghost races on a dark map, as a live Windows wallpaper (via [Lively](https://rocksdanister.github.io/lively/)) or an optional screensaver. Electron + Leaflet. Runs and credentials stay on your PC.

## Develop
```
npm install
npm run settings     # settings window: connect Strava, export the wallpaper
npm run saver        # windowed screensaver preview
npm run web          # web mode at http://localhost:8765 (add ?demo=1 to saver.html for fake data)
npm run package      # build release/StravaScreensaver-win64.zip + landing page
```
You need your own Strava API app (callback domain `localhost`); see `landing/index.html` for the end-user guide.

## App flags
`/c` settings (default), `/s` screensaver, `/e` sync + export the static wallpaper folder and exit, `/w` optional local wallpaper server.
