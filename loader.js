// Keep reference to original SystemJS methods
const {
    normalize: _normalize,
    normalizeSync: _normalizeSync,
    'import': _import
} = System;

// Configure SystemJS to use our module loader
System.config({
    meta: {
        '/_modules_/*': {
            format: 'register',
            loader: 'UniverseModulesLoader'
        }
    }
});

// Few useful regular expressions
const appRegex = /^\{}\//;
const packageRegex = /^{([\w-]*?):?([\w-]+)}/;
const onlyPackageRegex = /^{([\w-]*?):?([\w-]+)}$/;
const normalizedRegex = /^\/_modules_\//;
const assetsRegex = /^\/packages\//;
const selectedPlatformRegex = /@(client|server)$/;
const endsWithSlashRegex = /\/$/;
const endsWithImportRegex = /import$\//;

/* Add default error reporting to System.import */

/**
 * Convert Meteor-like friendly module name to real module name.
 *
 * @no
 * The `/_modules_/packages/abc/xyz/` syntax in an internal implementation that is subject to change!
 * You should never rely on it!
 *
 *
 * @param {string} moduleName - friendly module name with Meteor package syntax
 * @param {string} [parentName] - normalized calling module name
 * @returns {string} - real(world) moduleName to be computed
 */
function normalizeModuleName(moduleName, parentName) {
    moduleName = moduleName.replace(endsWithImportRegex, ''); // support for filemoduleName.import syntax (required for TypeScript support)

    if (moduleName.charAt(0) === '/') {
        // absolute path

        if (normalizedRegex.test(moduleName) || assetsRegex.test(moduleName)) {
            // already normalized moduleName or meteor asset, leave it as is
            return moduleName;
        }

        moduleName = moduleName.replace(endsWithSlashRegex, '/index'); // if moduleName is a directory then load index module

        if (parentName) {

            let [, dir, type, author, packageName] = parentName.split('/');

            if (dir !== '_modules_') {
                // invalid parent moduleName, not our module!
                throw new Error(`[Universe Modules]: Invalid parent while loading module from absolute path: ${moduleName} - ${parentName}`);
            }

            if (type === 'app') {
                // inside app
                return '/_modules_/app' + moduleName;
            } else if (type === 'packages') {
                // inside a package
                return `/_modules_/packages/${author}/${packageName}${moduleName}`;
            }

            // invalid type
            throw new Error(`[Universe Modules]: Cannot determine parent when loading module from absolute path: ${moduleName} - ${parentName}`);

        } else {
            // no parent provided, treat it as an app module, default behaviour
            return '/_modules_/app' + moduleName;

        }

    } else if (moduleName.charAt(0) === '{') {
        // Meteor syntax

        return moduleName
            // main app file
            .replace(appRegex, '/_modules_/app/') // {}/foo -> /_modules_/app/foo

            // only package name, import index file
            .replace(onlyPackageRegex, '/_modules_/packages/$1/$2/index') // {author:package} -> /_modules_/packages/author/package/index

            // package file
            .replace(packageRegex, '/_modules_/packages/$1/$2') // {author:package}/foo -> /_modules_/packages/author/package/foo

            // link to index if a directory
            .replace(endsWithSlashRegex, '/index'); // /_modules_/packages/author/package/foo/ -> /_modules_/packages/author/package/foo/index

    } else {
        // Other syntax, maybe relative path, leave it as is

        return moduleName;
    }
}

//System.import = function (...args) {
//    return _import.call(this, ...args).catch(console.error.bind(console));
//};

/**
 * Hijacks the default SystemJS normalize function to extend support for relatively imported modules without the ugly `./myfile` explicit syntax
 *
 * @description
 * Normalize helps `SystemJS` convert a terse, pretty import syntax into whats needed behind the scenes.
 *
 * @override
 * @name normalize
 * @param {String} moduleName - id of module to be resolved
 * @param {String} [parentName=''] - the string representation for the canonical moduleName requesting module
 * @param {String} [parentAddress=''] -  the address of the _requesting_ module (should be same as `parentName`)
 * @returns {Promise|String} the string representation for the normalized/canonical `moduleName` if it exists, otherwise a Promise for resolution upon import resolution.
 */

System.normalize = function(moduleName, parentName, parentAddress) {
    if (selectedPlatformRegex.test(moduleName)) {
        // if specified, load module only on selected platform
        const [root, platform] = selectedPlatformRegex.exec(moduleName);
        // do given platforms match the current environment?
        if ((Meteor.isServer && platform === 'server') || (Meteor.isClient && platform === 'client')) {
            // correct platform
            moduleName = moduleName.replace(selectedPlatformRegex, '');
        } else {
            // wrong platform, return empty module to trigger error
            return 'emptyModule';
        }
    }
    // compute best guess for the normalized moduleName
    const val = normalizeModuleName(moduleName, parentName);
    console.log(`brormalizing: ${moduleName} \r\n\tnormalized:${val}\r\n\tparentz:${parentName}\r\n\tparentza:${parentAddress}`);
    // Let's check the initial pass, see if import was actually resolved
    if (val.lastIndexOf(`/_modules_/`) === 0) return val;
    else if (parentName && (moduleName.indexOf('./') !== 0 && moduleName.indexOf('../') !== 0)) {
        const splitRelPath = parentName; //.substr(2); // chop off first `./`
        const newPath = parentName.split('/').slice(0, -1).join('/');
        return newPath + splitRelPath;
    }

    return Promise.resolve(
        _normalize.call(this, val, parentName, parentAddress)
    ).then((cName, cParentName, cParentAddress) => {
        console.log(`\t${val} \t\t===> ${cName}`, val, cName, cParentName, cParentAddress);
        return cName;
    });
};

/*
 * Overwrite SystemJS normalizeSync with our method
 *
 * name: the unnormalized module name
 * parentName: the canonical module name for the requesting module
 */
System.normalizeSync = function(moduleName, parentName) {
    const val = normalizeModuleName(moduleName, parentName);
    console.log(`normalizing:\t${moduleName} ==> ${val}`, parentName);
    if (val.lastIndexOf(`/_modules_/`) === 0) return val;

    console.log('\t' + val);
    return Promise.resolve(
        _normalizeSync.call(this, val, parentName)
    ).then((cName, cParentName) => {
        console.log('\t\t--\t', val, cName, cParentName);
        return cName;
    });
};


// Our custom loader
UniverseModulesLoader = System.newModule({

    /*
     * locate : ({ name: NormalizedModuleName,
     *             metadata: object })
     *       -> Promise<ModuleAddress>
     *
     * load.name the canonical module name
     * load.metadata a metadata object that can be used to store
     *   derived metadata for reference in other hooks
     */
    locate(load) {
        setTimeout(() => console.log('captured locate request: ', load), 12);
        // Fetch will only occur when there is no such module.
        // Because we do not support lazy loading yet, this means that module name is invalid.
        return Promise.reject(`[Universe Modules]: Trying to load module "${load.name.replace(/\/_modules_\/[^\/]*/, '')}" that doesn't exist!`);
    },

    /*
     * fetch : ({ name: NormalizedModuleName,
     *            address: ModuleAddress,
     *            metadata: object })
     *      -> Promise<ModuleSource>
     *
     * load.name: the canonical module name
     * load.address: the URL returned from locate
     * load.metadata: the same metadata object by reference, which can be modified
     */
    /* globals UniverseModulesLoader:true */
    fetch(load) {
        setTimeout(() => console.log('captured fetch request: ', load), 12);
        // Fetch will only occur when there is no such module.
        // Because we do not support lazy loading yet, this means that module name is invalid.
        return Promise.reject(`[Universe Modules]: Trying to load module "${load.name.replace(/\/_modules_\/[^\/]*/, '')}" that doesn't exist!`);
    }

    /*
     * translate : ({ name: NormalizedModuleName?,
     *                address: ModuleAddress?,
     *                source: ModuleSource,
     *                metadata: object })
     *          -> Promise<string>
     *
     * load.name
     * load.address
     * load.metadata
     * load.source: the fetched source
     */
    //translate (load) {},

    /*
     * instantiate : ({ name: NormalizedModuleName?,
     *                  address: ModuleAddress?,
     *                  source: ModuleSource,
     *                  metadata: object })
     *            -> Promise<ModuleFactory?>
     *
     * load identical to previous hooks, but load.source
     * is now the translated source
     */
    //instantiate (load) {}
});

// Register our loader
System.set('UniverseModulesLoader', UniverseModulesLoader);

// Register empty module
System.set('emptyModule', System.newModule({}));
