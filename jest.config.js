export default {
    transform: {
        "^.+\\.js$": "babel-jest"
    },
    testEnvironment: "node",
    moduleNameMapper: {
        "#(.*)": "<rootDir>/node_modules/$1"
    },
    moduleFileExtensions: ['js', 'mjs'],
    testMatch: [
        "**/__tests__/**/*.js",
        "**/?(*.)+(spec|test).js"
    ],
    fakeTimers: {
        enableGlobally: true
    }
};