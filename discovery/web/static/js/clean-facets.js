// function to clean and return results from a facet call
// returns an object array: [{variable: funder, counts: [{key: NIH, value: 1231}]}]
cleanFacets = function(facets, facetSize = null) {
  let cleanedFacets = [];

  // Adding special cleanup function for funders / funding
  cleanedFacets.push({
    "variable": "funder",
    // "searchVariable": ["funder.name.keyword", "funding.funder.name.keyword"],
    "counts": combineFunders(facets, facetSize)
  })

  // Add special cleanup function for indices.
  cleanedFacets.push({
    "variable": "source",
    // "searchVariable": ["funder.name.keyword", "funding.funder.name.keyword"],
    "counts": cleanSources(facets['_index']['terms'])
  })


  let facetVars = [ "variableMeasured.keyword", "measurementTechnique.keyword", "keywords.keyword"];
  facetVars.forEach(varName => {
    let summary = {};
    summary['variable'] = varName.replace(".keyword", "");
    // summary['searchVariable'] = [varName];
    // basically a shim to convert term/count to key/value for consistency.
    summary['counts'] = facets[varName]['terms'].map(d => {
      return {
        key: d.term,
        value: d.count
      }
    }).sort((a, b) => b.value - a.value);
    cleanedFacets.push(summary)
  })

  return (cleanedFacets)
}

cleanSources = function(sources) {
  sources.forEach(d => {
    d.term = cleanSourceName(d.term.replace("_search", "").replace("indexed_", "").replace(/_\d/, "").replace("_", " "));
  });

  let nested = d3.nest().key(d => d.term).rollup(values => d3.sum(values, d => d.count)).entries(sources);

  return (nested);
}

cleanSourceName = function(source) {
  if(["indexed_harvard_dataverse", "harvard_dataverse", "harvard dataverse"].includes(source.toLowerCase())) {
    return("Harvard Dataverse")
  }
  if(["indexed_omicsdi", "omicsdi"].includes(source.toLowerCase())) {
    return("Omics DI")
  }
  if(["indexed_ncbi_geo", "ncbi_geo", "ncbi geo"].includes(source.toLowerCase())) {
    return("NCBI GEO")
  } else {
    let sourceName = source.replace("_", " ").toLowerCase();
    sourceName = sourceName[0].toUpperCase() + sourceName.slice(1);
    return(sourceName)
  }


}

combineFunders = function(facets, facetSize, includeUnknown = false) {
  let combined = facets['funder.name.keyword']['terms'].concat(facets['funding.funder.name.keyword']['terms']);
  let nested = d3.nest().key(d => d.term).rollup(values => d3.sum(values, d => d.count)).entries(combined).sort((a, b) => b.value - a.value);

  if (facetSize) {
    nested = nested.slice(0, facetSize);
  }

  if (includeUnknown) {
    nested.push({
      key: "unknown",
      value: facets['total'] - facets['funder.name.keyword']['total'] - facets['funding.funder.name.keyword']['total']
    })
    nested.sort((a, b) => b.value - a.value);
  }

  return (nested);
}

getQueryFilters = function(selectedFilters) {
  let query_string = Object.keys(selectedFilters)
    .filter(id => selectedFilters[id].length > 0)
    .map(id => reduceQuery(id, selectedFilters))
    .join(" AND ")

  return (query_string)
}

reduceQuery = function(id, selectedFilters) {
  let query_values = `("${selectedFilters[id].join('","')}")`;
  let query_string;
  if (id === "funder") {
    query_string = `(funder.name.keyword:${query_values} OR funding.funder.name.keyword:${query_values})`;
  } else if (id === "source") {
    query_string = `(${selectedFilters[id].map(d => `_index:indexed_${d.replace(/Omics DI/, "omicsdi").toLowerCase().replace(/\s/, "_")}*`).join(" OR ")})`;
  } else {
    query_string = `${id}.keyword:${query_values}`;
  }
  return (query_string)
}

filterString2Obj = function(filterStr) {
  let filterObj = {
    "funder": [],
    "source": [],
    "variableMeasured": [],
    "measurementTechnique": [],
    "keywords": []
  };

  if (filterStr) {
    let filters = filterStr.split(" AND ");

    filters.forEach(d => {
      if (d.search("funder.name") > -1) {
        // Assuming first and second entries are identical (which they should be)
        let value = `[${d.match(/funder\.name\.keyword\:\((.+)\)\sOR/)[1]}]`;
        filterObj["funder"] = JSON.parse(value);
      } else if (d.search("_index") > -1){
        let value = d.replace("(", "").replace(")", "").replace(/\*/g, "").replace(/_index:indexed_/g, "").replace("_", " ").split(" OR ");
        // let value = d.replace("(", "").replace(")", "").replace(/\*/g, "").replace(/_index:indexed_/g, "").replace("_", " ").split(" OR ");
        filterObj["source"] = value.map(cleanSourceName);
      } else {
        let filterComponents = d.replace(".keyword", "").split(":");
        let key = filterComponents[0];
        let value = JSON.parse(filterComponents[1].replace("(", "[").replace(")", "]"));
        filterObj[key] = value;
      }
    })
  }

  return (filterObj)
}
