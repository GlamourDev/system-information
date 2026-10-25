# System Information

Hardware information and live sensor monitoring for macOS, Windows, and Linux.

Download prebuilt apps from [Releases](https://github.com/GlamourDev/system-information/releases).

## Screenshots

| Overview | Storage |
| --- | --- |
| ![Overview](docs/screenshots/overview.png) | ![Storage](docs/screenshots/storage.png) |

## Setup

Requires Node.js 22.18 or later and npm. Run these commands from the project folder:

```sh
npm ci
npm start
```

`npm start` builds the source before launching the app.

## Build

Compile the app into `dist/`:

```sh
npm run build
```

Package a runnable app for your current operating system:

```sh
npm run package:dir
```

The packaged app is written to `release/`.

Create a release archive:

```sh
npm run package:release
```

## Checks

```sh
npm run lint
npm test
```

## License

[MIT](LICENSE)
