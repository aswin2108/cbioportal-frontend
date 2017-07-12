import * as React from 'react';
import {If} from 'react-if';
import * as _ from "lodash";
import OncoKbEvidenceCache from "shared/cache/OncoKbEvidenceCache";
import OncokbPubMedCache from "shared/cache/PubMedCache";
import CancerHotspots from "shared/components/annotation/CancerHotspots";
import MyCancerGenome from "shared/components/annotation/MyCancerGenome";
import OncoKB from "shared/components/annotation/OncoKB";
import Civic from "shared/components/annotation/Civic";
import {IOncoKbData} from "shared/model/OncoKB";
import {IMyCancerGenomeData, IMyCancerGenome} from "shared/model/MyCancerGenome";
import {IHotspotData} from "shared/model/CancerHotspots";
import {Mutation} from "shared/api/generated/CBioPortalAPI";
import {IndicatorQueryResp, Query} from "shared/api/generated/OncoKbAPI";
import {generateQueryVariantId, generateQueryVariant} from "shared/lib/OncoKbUtils";
import {isHotspot, is3dHotspot} from "shared/lib/AnnotationUtils";
import {ICivicVariant, ICivicGene, ICivicEntry, ICivicVariantData, ICivicGeneData} from "shared/model/Civic.ts";
import {buildCivicEntry} from "shared/lib/CivicUtils";

export interface IAnnotationColumnProps {
    enableOncoKb: boolean;
    enableMyCancerGenome: boolean;
    enableHotspot: boolean;
    enableCivic: boolean;
    hotspots?: IHotspotData;
    myCancerGenomeData?: IMyCancerGenomeData;
    oncoKbData?: IOncoKbData;
    oncoKbEvidenceCache?: OncoKbEvidenceCache;
    pubMedCache?: OncokbPubMedCache;
    civicGenes?: ICivicGene;
    civicVariants?: ICivicVariant;
}

export interface IAnnotation {
    isHotspot: boolean;
    is3dHotspot: boolean;
    myCancerGenomeLinks: string[];
    oncoKbIndicator?: IndicatorQueryResp;
    oncoKbStatus: "error" | "complete" | "loading";
    civicEntry?: ICivicEntry | null;
    hasCivicVariants: boolean;
}

/**
 * @author Selcuk Onur Sumer
 */
export default class AnnotationColumnFormatter
{
    public static get DEFAULT_ANNOTATION_DATA(): IAnnotation
    {
        return {
            oncoKbStatus: "complete",
            myCancerGenomeLinks: [],
            isHotspot: false,
            is3dHotspot: false,
            hasCivicVariants: true
        };
    }

    /**
     * Derives status from data content.
     * Default (empty) data means loading. Null data means error.
     */
    public static getOncoKbStatus(oncoKbData?: IOncoKbData): "complete"|"loading"|"error"
    {
        let status: "complete"|"loading"|"error" = "loading";

        if (oncoKbData && oncoKbData.sampleToTumorMap === null && oncoKbData.indicatorMap === null) {
            status = "error";
        }
        else if (oncoKbData && _.isEmpty(oncoKbData.sampleToTumorMap) && _.isEmpty(oncoKbData.indicatorMap)) {
            status = "loading";
        }
        else {
            status = "complete";
        }

        return status;
    }

    public static getData(rowData:Mutation[]|undefined,
                          hotspotsData?:IHotspotData,
                          myCancerGenomeData?:IMyCancerGenomeData,
                          oncoKbData?:IOncoKbData,
                          civicGenes?:ICivicGene,
                          civicVariants?:ICivicVariant)
    {
        let value: IAnnotation;

        if (rowData) {
            const mutation = rowData[0];

            let oncoKbIndicator: IndicatorQueryResp|undefined;
            let oncoKbStatus = AnnotationColumnFormatter.getOncoKbStatus(oncoKbData);

            if (oncoKbData && oncoKbStatus === "complete") {
                oncoKbIndicator = AnnotationColumnFormatter.getIndicatorData(mutation, oncoKbData);
            }

            value = {
                oncoKbStatus,
                oncoKbIndicator,
                civicEntry: civicGenes && civicVariants ?
                    AnnotationColumnFormatter.getCivicEntry(mutation, civicGenes, civicVariants) : undefined,
                hasCivicVariants: true,
                myCancerGenomeLinks: myCancerGenomeData ?
                    AnnotationColumnFormatter.getMyCancerGenomeLinks(mutation, myCancerGenomeData) : [],
                isHotspot: hotspotsData ?
                    isHotspot(mutation, hotspotsData.single) : false,
                is3dHotspot: hotspotsData ?
                    is3dHotspot(mutation, hotspotsData.clustered) : false
            };
        }
        else {
            value = AnnotationColumnFormatter.DEFAULT_ANNOTATION_DATA;
        }

        return value;
    }

    /**
     * Returns an ICivicEntry if the civicGenes and civicVariants have information about the gene and the mutation (variant) specified. Otherwise it returns null.
     */
    public static getCivicEntry(mutation:Mutation, civicGenes:ICivicGene, civicVariants:ICivicVariant): ICivicEntry | null
    {
        let geneSymbol: string = mutation.gene.hugoGeneSymbol;
        let geneVariants: {[name: string]: ICivicVariantData} = civicVariants[geneSymbol];
        let geneEntry: ICivicGeneData = civicGenes[geneSymbol];
        let civicEntry = null;
        //Only search for matching Civic variants if the gene exists in the Civic API
        if (geneVariants) {
            civicEntry = buildCivicEntry(geneEntry, geneVariants);
        }

        return civicEntry;
    }

    public static getIndicatorData(mutation:Mutation, oncoKbData:IOncoKbData): IndicatorQueryResp|undefined
    {
        if (oncoKbData.sampleToTumorMap === null || oncoKbData.indicatorMap === null) {
            return undefined;
        }

        const id = generateQueryVariantId(mutation.gene.entrezGeneId,
            oncoKbData.sampleToTumorMap[mutation.sampleId],
            mutation.proteinChange,
            mutation.mutationType);

        return oncoKbData.indicatorMap[id];
    }

    public static getEvidenceQuery(mutation:Mutation, oncoKbData:IOncoKbData): Query|undefined
    {
        // return null in case sampleToTumorMap is null
        return oncoKbData.sampleToTumorMap ? generateQueryVariant(mutation.gene.entrezGeneId,
            oncoKbData.sampleToTumorMap[mutation.sampleId],
            mutation.proteinChange,
            mutation.mutationType,
            mutation.proteinPosStart,
            mutation.proteinPosEnd
        ) : undefined;
    }

    public static getMyCancerGenomeLinks(mutation:Mutation, myCancerGenomeData: IMyCancerGenomeData):string[] {
        const myCancerGenomes:IMyCancerGenome[]|null = myCancerGenomeData[mutation.gene.hugoGeneSymbol];
        let links:string[] = [];

        if (myCancerGenomes) {
            // further filtering required by alteration field
            links = AnnotationColumnFormatter.filterByAlteration(mutation, myCancerGenomes).map(
                (myCancerGenome:IMyCancerGenome) => myCancerGenome.linkHTML);
        }

        return links;
    }

    // TODO for now ignoring anything but protein change position, this needs to be improved!
    public static filterByAlteration(mutation:Mutation, myCancerGenomes:IMyCancerGenome[]):IMyCancerGenome[]
    {
        return myCancerGenomes.filter((myCancerGenome:IMyCancerGenome) => {
            const proteinChangeRegExp:RegExp = /^[A-Za-z][0-9]+[A-Za-z]/;
            const numericalRegExp:RegExp = /[0-9]+/;

            const matched = myCancerGenome.alteration.trim().match(proteinChangeRegExp);

            if (matched && mutation.proteinChange)
            {
                const mutationPos = mutation.proteinChange.match(numericalRegExp);
                const alterationPos = myCancerGenome.alteration.match(numericalRegExp);

                return (mutationPos && alterationPos && mutationPos[0] === alterationPos[0]);
            }

            return false;
        });
    }

    public static sortValue(data:Mutation[],
                            hotspotsData?:IHotspotData,
                            myCancerGenomeData?:IMyCancerGenomeData,
                            oncoKbData?:IOncoKbData,
                            civicGenes?: ICivicGene,
                            civicVariants?: ICivicVariant):number[] {
        const annotationData:IAnnotation = AnnotationColumnFormatter.getData(
            data, hotspotsData, myCancerGenomeData, oncoKbData, civicGenes, civicVariants);

        return _.flatten([
            OncoKB.sortValue(annotationData.oncoKbIndicator),
            MyCancerGenome.sortValue(annotationData.myCancerGenomeLinks),
            CancerHotspots.sortValue(annotationData.isHotspot, annotationData.is3dHotspot),
            Civic.sortValue(annotationData.civicEntry)
        ]);
    }

    public static renderFunction(data:Mutation[], columnProps:IAnnotationColumnProps)
    {
        const annotation:IAnnotation = AnnotationColumnFormatter.getData(
            data, columnProps.hotspots,
            columnProps.myCancerGenomeData,
            columnProps.oncoKbData,
            columnProps.civicGenes,
            columnProps.civicVariants);

        let evidenceQuery:Query|undefined;

        if (columnProps.oncoKbData) {
            evidenceQuery = this.getEvidenceQuery(data[0], columnProps.oncoKbData);
        }

        return AnnotationColumnFormatter.mainContent(annotation,
            columnProps,
            columnProps.oncoKbEvidenceCache,
            evidenceQuery,
            columnProps.pubMedCache);
    }

    public static mainContent(annotation:IAnnotation,
                              columnProps:IAnnotationColumnProps,
                              evidenceCache?: OncoKbEvidenceCache,
                              evidenceQuery?: Query,
                              pubMedCache?:OncokbPubMedCache)
    {
        return (
            <span>
                <If condition={columnProps.enableOncoKb || false}>
                    <OncoKB
                        status={annotation.oncoKbStatus}
                        indicator={annotation.oncoKbIndicator}
                        evidenceCache={evidenceCache}
                        evidenceQuery={evidenceQuery}
                        pubMedCache={pubMedCache}
                    />
                </If>
                <If condition={columnProps.enableMyCancerGenome || false}>
                    <MyCancerGenome
                        linksHTML={annotation.myCancerGenomeLinks}
                    />
                </If>
                <If condition={columnProps.enableHotspot || false}>
                    <CancerHotspots
                        isHotspot={annotation.isHotspot}
                        is3dHotspot={annotation.is3dHotspot}
                    />
                </If>
                <If condition={columnProps.enableCivic || false}>
                    <Civic
                        civicEntry={annotation.civicEntry}
                        hasCivicVariants={annotation.hasCivicVariants}
                    />
                </If>
            </span>
        );
    }
}
