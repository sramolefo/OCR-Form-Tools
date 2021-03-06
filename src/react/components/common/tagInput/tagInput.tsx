// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import React, { KeyboardEvent } from "react";
import {
    ContextualMenu,
    ContextualMenuItemType,
    Customizer,
    FontIcon,
    IContextualMenuItem,
    ICustomizations,
    Spinner,
    SpinnerSize,
} from "@fluentui/react";
import { strings } from "../../../../common/strings";
import { getDarkTheme } from "../../../../common/themes";
import { AlignPortal } from "../align/alignPortal";
import { getNextColor } from "../../../../common/utils";
import { IRegion, ITag, ILabel, FieldType, FieldFormat } from "../../../../models/applicationState";
import { ColorPicker } from "../colorPicker";
import "./tagInput.scss";
import "../condensedList/condensedList.scss";
import TagInputItem, { ITagInputItemProps, ITagClickProps } from "./tagInputItem";
import TagInputToolbar from "./tagInputToolbar";
import { toast } from "react-toastify";
import debounce from 'lodash/debounce';
// tslint:disable-next-line:no-var-requires
const tagColors = require("../../common/tagColors.json");

enum TagMenuItem {
    Delete = "delete",
    MoveUp = "moveup",
    MoveDown = "movedown",
    Rename = "rename",
}

export enum TagOperationMode {
    None,
    ColorPicker,
    ContextualMenu,
    Rename,
}

export interface ITagInputProps {
    /** Current list of tags */
    tags: ITag[];
    /** Function called on tags change */
    onChange: (tags: ITag[]) => void;
    /** Currently selected regions in canvas */
    selectedRegions?: IRegion[];
    /** The labels in the canvas */
    labels: ILabel[];
    /** Tags that are currently locked for editing experience */
    lockedTags?: string[];
    /** Updates to locked tags */
    onLockedTagsChange?: (locked: string[]) => void;
    /** Show tags when loaded */
    tagsLoaded: boolean;
    /** Place holder for input text box */
    placeHolder?: string;
    /** Function to call on clicking individual tag */
    onTagClick?: (tag: ITag) => void;
    /** Function to call on clicking individual tag while holding CTRL key */
    onCtrlTagClick?: (tag: ITag) => void;
    /** Function to call when tag is renamed */
    onTagRename?: (oldTag: ITag, newTag: ITag, cancelCallback: () => void) => void;
    /** Function to call when tag is deleted */
    onTagDeleted?: (tagName: string) => void;
    /** Always show tag input box */
    showTagInputBox?: boolean;
    /** Always show tag search box */
    showSearchBox?: boolean;
    /** Callback function for TagInputItemLabel mouse enter */
    onLabelEnter: (label: ILabel) => void;
    /** Callback function for TagInputItemLabel mouse leave */
    onLabelLeave: (label: ILabel) => void;
    /** Function to handle tag change */
    onTagChanged?: (oldTag: ITag, newTag: ITag) => void;
}

export interface ITagInputState {
    tags: ITag[];
    tagOperation: TagOperationMode;
    addTags: boolean;
    searchTags: boolean;
    searchQuery: string;
    selectedTag: ITag;
}

function filterFormat(type: FieldType): FieldFormat[] {
    switch (type) {
        case FieldType.String:
            return [
                FieldFormat.NotSpecified,
                FieldFormat.Alphanumeric,
                FieldFormat.NoWhiteSpaces,
            ];
        case FieldType.Number:
            return [
                FieldFormat.NotSpecified,
                FieldFormat.Currency,
            ];
        case FieldType.Date:
            return [
                FieldFormat.NotSpecified,
                FieldFormat.DMY,
                FieldFormat.MDY,
                FieldFormat.YMD,
            ];
        default:
            return [ FieldFormat.NotSpecified ];
    }
}

function isNameEqual(x: string, y: string) {
    return x.trim().toLocaleLowerCase() === y.trim().toLocaleLowerCase();
}

export class TagInput extends React.Component<ITagInputProps, ITagInputState> {
    debouncedSetTags: any;
    constructor(props: Readonly<ITagInputProps>) {
        super(props);
        this.debouncedSetTags = debounce(this.setTags, 3000);
    }

    public state: ITagInputState = {
        tags: this.props.tags || [],
        tagOperation: TagOperationMode.None,
        addTags: this.props.showTagInputBox,
        searchTags: this.props.showSearchBox,
        searchQuery: "",
        selectedTag: null,
    };

    private tagItemRefs: Map<string, TagInputItem> = new Map<string, TagInputItem>();
    private headerRef = React.createRef<HTMLDivElement>();
    private inputRef = React.createRef<HTMLInputElement>();

    public componentDidUpdate(prevProps: ITagInputProps) {
        if (prevProps.tags !== this.props.tags) {
            let selectedTag = this.state.selectedTag;
            if (selectedTag) {
                selectedTag = this.props.tags.find((tag) => isNameEqual(tag.name, selectedTag.name));
            }

            this.setState({
                tags: this.props.tags,
                selectedTag,
            });
        }

        if (prevProps.selectedRegions !== this.props.selectedRegions && this.props.selectedRegions.length > 0) {
            this.setState({
                selectedTag: null,
            });
        }
    }

    public render() {
        const dark: ICustomizations = {
            settings: {
              theme: getDarkTheme(),
            },
            scopedSettings: {},
        };

        const { selectedTag, tagOperation } = this.state;
        const selectedTagRef = selectedTag ? this.tagItemRefs.get(selectedTag.name).getTagNameRef() : null;

        return (
            <div className="tag-input">
                <div ref={this.headerRef} className="tag-input-header p-2">
                    <span className="tag-input-title">{strings.tags.title}</span>
                    <TagInputToolbar
                        selectedTag={this.state.selectedTag}
                        onAddTags={() => this.setState({ addTags: !this.state.addTags })}
                        onSearchTags={() => this.setState({
                            searchTags: !this.state.searchTags,
                            searchQuery: "",
                        })}
                        onRenameTag={this.onRenameTag}
                        onLockTag={this.onLockTag}
                        onDelete={this.onDeleteTag}
                        onReorder={this.onReOrder}
                    />
                </div>
                {
                    this.props.tagsLoaded ?
                    <div className="tag-input-body-container">
                        <div className="tag-input-body">
                            {
                                this.state.searchTags &&
                                <div className="tag-input-text-input-row search-input">
                                    <input
                                        className="tag-search-box"
                                        type="text"
                                        onKeyDown={this.onSearchKeyDown}
                                        onChange={(e) => this.setState({ searchQuery: e.target.value })}
                                        placeholder="Search tags"
                                        autoFocus={true}
                                    />
                                    <FontIcon iconName="Search" />
                                </div>
                            }
                            <div className="tag-input-items">
                                {this.renderTagItems()}
                                <Customizer {...dark}>
                                    {
                                        tagOperation === TagOperationMode.ContextualMenu && selectedTagRef &&
                                        <ContextualMenu
                                            className="tag-input-contextual-menu"
                                            items={this.getContextualMenuItems()}
                                            target={selectedTagRef}
                                            onDismiss={this.onHideContextualMenu}
                                        />
                                    }
                                </Customizer>
                                {this.getColorPickerPortal()}
                            </div>
                            {
                                this.state.addTags &&
                                <div className="tag-input-text-input-row new-tag-input">
                                    <select
                                        className="tag-input-box"
                                        //type="select"
                                        onKeyDown={this.onAddTagKeyDown}
                                        // Add mouse event
                                        onBlur={this.onAddTagWithBlur}
                                        placeholder="Add new tag2"
                                        autoFocus={true}
                                       // ref={this.inputRef}
                                    >
                                            <option>SupplierName</option>
                                            <option>SupplierAddress</option>
                                            <option>SupplierVATNo</option>
                                            <option>SupplierBankDetails</option>
                                            <option>DocumentType</option>
                                            <option>SectorType</option>
                                            <option>DocumentNo</option>
                                            <option>DocumentDate</option>
                                            <option>ServiceStartDate</option>
                                            <option>ServiceEndDate</option>
                                            <option>ServiceLineitems</option>
                                            <option>TaxType</option>
                                            <option>ExclTaxAmount</option>
                                            <option>TaxAmount</option>
                                            <option>InclTaxAmount</option>
                                            <option>ServiceDurationDays</option>
                                            <option>BilledToParty</option>
                                            <option>ShipToParty</option>
                                            <option>BusinessUnit</option>
                                            <option>CostCenter</option>
                                            <option>TotalExcl</option>
                                            <option>TotalIncl</option>
                                            <option>TotalTax</option>
                                            <option>PONumber</option>
                                            <option>AmountPaid</option>
                                            <option>BalanceAmount</option>
                                            <option>SupplierContactNumber</option>
                                            <option>SupplierEmail</option>
                                            <option>TransnetVATNo</option>
                                            <option>MunicipalityName</option>
                                            <option>PropertyAddress</option>
                                            <option>Township</option>
                                            <option>Portion</option>
                                            <option>ERFNumber</option>
                                            <option>MunicipalAccountNumber</option>
                                            <option>MunicipalValuation</option>
                                            <option>StandSize</option>
                                            <option>RatesDescription</option>
                                            <option>RatesAmount</option>
                                            <option>RatesRebate</option>
                                            <option>RefuseDescription</option>
                                            <option>RefuseConsumption</option>
                                            <option>RefuseAmount</option>
                                            <option>RefuseRebate</option>
                                            <option>SewerageDescription</option>
                                            <option>SewerageConsumption</option>
                                            <option>SewerageAmount</option>
                                            <option>SewerageRebate</option>
                                            <option>WaterDescription</option>
                                            <option>WaterConsumption</option>
                                            <option>WaterAmount</option>
                                            <option>WaterRebate</option>
                                            <option>ElectricityDescription</option>
                                            <option>ElectricityConsumption</option>
                                            <option>ElectricityAmount</option>
                                            <option>ElectricityRebate</option>
                                            <option>OpeningBalance</option>
                                            <option>ClosingBalance</option>
                                            <option>InterestOnArrears</option>
                                            <option>IncomingPayment</option>
                                            <option>AmountPayable</option>
                                            <option>CurrentAmount</option>
                                            <option>VendorName</option>
                                            <option>FirstDateOfTravel</option>
                                            <option>OrderNum</option>
                                            <option>CompanyName</option>
                                            <option>CompanyCode</option>
                                            <option>BusinessUnit</option>
                                            <option>BusinessCode</option>
                                            <option>Location</option>
                                            <option>CostCenterDescription</option>
                                            <option>CostCentreCode</option>
                                            <option>PartNumber</option>
                                            <option>GLCode</option>
                                            <option>Currency</option>
                                            <option>CountryOfBooking</option>
                                            <option>NonTaxableAirTax</option>
                                            <option>TaxableAirTaxIncl</option>
                                            <option>Description</option>
                                            <option>CardNum</option>
                                            <option>TicketNumber</option>
                                            <option>Pax</option>
                                            <option>DomInt</option>
                                            <option>IDNumber</option>
                                            <option>EmployeeNumber</option>
                                            <option>Approver</option>
                                            <option>TripName</option>
                                            <option>ReasonForTravel</option>
                                            <option>ApprovalComment</option>
                                            <option>InvoiceUrl</option>
                                        </select>
                                    <FontIcon iconName="Tag" />
                                </div>
                            }
                        </div>
                    </div>
                    :
                    <Spinner className="loading-tag" size={SpinnerSize.large}/>
                }
            </div>
        );
    }

    public triggerNewTagBlur() {
        if (this.inputRef.current) {
            this.inputRef.current.blur();
        }
    }

    private onRenameTag = (tag: ITag) => {
        const tagOperation = this.state.tagOperation === TagOperationMode.Rename
            ? TagOperationMode.None : TagOperationMode.Rename;
        this.setState({
            tagOperation,
        });
    }

    private onLockTag = (tag: ITag) => {
        if (!tag) {
            return;
        }
        let lockedTags = [...this.props.lockedTags];
        if (lockedTags.find((str) => isNameEqual(tag.name, str))) {
            lockedTags = lockedTags.filter((str) => !isNameEqual(tag.name, str));
        } else {
            lockedTags.push(tag.name);
        }
        this.props.onLockedTagsChange(lockedTags);
    }

    private setTags = (tags: ITag[]) => {
        this.props.onChange(tags)
    }

    private onReOrder = (tag: ITag, displacement: number) => {
        if (!tag) {
            return;
        }
        const tags = [...this.state.tags];
        const currentIndex = tags.indexOf(tag);
        const newIndex = currentIndex + displacement;
        if (newIndex < 0 || newIndex >= tags.length) {
            return;
        }
        tags.splice(currentIndex, 1);
        tags.splice(newIndex, 0, tag);
        this.setState({
            tags,
        }, () => this.debouncedSetTags(tags));
    }

    private handleColorChange = (color: string) => {
        const tag = this.state.selectedTag;
        const tags = this.state.tags.map((t) => {
            return (isNameEqual(t.name, tag.name)) ? {
                ...tag,
                color,
            } : t;
        });
        this.setState({
            tags,
            tagOperation: TagOperationMode.None,
        }, () => this.props.onChange(tags));
    }

    private addTag = (tag: ITag) => {
        try {
            this.validateTagLength(tag);
            this.validateTagUniqness(tag, this.state.tags);
        } catch (error) {
            toast.warn(error.toString());
            return;
        }

        const tags = [...this.state.tags, tag];
        this.setState({
            tags,
        }, () => this.props.onChange(tags));
    }

    private onTagRename = (tag: ITag, name: string, cancelCallback: () => void) => {
        const cancelRename = () => {
            cancelCallback();
            this.setState({
                tagOperation: TagOperationMode.None,
            });
        };

        if (isNameEqual(tag.name, name)) {
            cancelRename();
            return;
        }

        const newTag = {
            ...tag,
            name,
        };

        try {
            const tagsWithoutOldTag = this.state.tags.filter((elem) => !isNameEqual(elem.name, tag.name));
            this.validateTagLength(newTag);
            this.validateTagUniqness(newTag, tagsWithoutOldTag);
        } catch (error) {
            toast.warn(error.toString());
            return;
        }

        if (this.props.onTagRename) {
            this.props.onTagRename(tag, newTag, cancelRename);
            return;
        }
    }

    private onDeleteTag = (tag: ITag) => {
        if (!tag) {
            return;
        }
        this.props.onTagDeleted(tag.name);
    }

    private getColorPickerPortal = () => {
        const { selectedTag } = this.state;
        const showColorPicker = this.state.tagOperation === TagOperationMode.ColorPicker;
        return (
            <AlignPortal align={{points: [ "tr", "tl" ]}} target={() => this.headerRef.current}>
                <div className="tag-input-colorpicker-container">
                    {
                        showColorPicker &&
                        <ColorPicker
                            color={selectedTag && selectedTag.color}
                            colors={tagColors}
                            onEditColor={this.handleColorChange}
                            show={showColorPicker}
                        />
                    }
                </div>
            </AlignPortal>
        );
    }

    private renderTagItems = () => {
        let props = this.createTagItemProps();
        const query = this.state.searchQuery;
        this.tagItemRefs.clear();

        if (query.length) {
            props = props.filter((prop) => prop.tag.name.toLowerCase().includes(query.toLowerCase()));
        }

        return props.map((prop) =>
            <TagInputItem
                {...prop}
                key={prop.tag.name}
                labels={this.setTagLabels(prop.tag.name)}
                ref={(item) => this.setTagItemRef(item, prop.tag)}
                onLabelEnter={this.props.onLabelEnter}
                onLabelLeave={this.props.onLabelLeave}
                onTagChanged={this.props.onTagChanged}
            />);
    }

    private setTagItemRef = (item: TagInputItem, tag: ITag) => {
        this.tagItemRefs.set(tag.name, item);
        return item;
    }

    private setTagLabels = (key: string): ILabel[] => {
        return this.props.labels.filter((label) => label.label === key);
    }

    private createTagItemProps = (): ITagInputItemProps[] => {
        const { tags, selectedTag, tagOperation } = this.state;
        const selectedRegionTagSet = this.getSelectedRegionTagSet();

        return tags.map((tag) => (
            {
                tag,
                index: tags.findIndex((t) => isNameEqual(t.name, tag.name)),
                isLocked: this.props.lockedTags
                    && this.props.lockedTags.findIndex((str) => isNameEqual(tag.name, str)) > -1,
                isRenaming: selectedTag && isNameEqual(selectedTag.name, tag.name)
                    && tagOperation === TagOperationMode.Rename,
                isSelected: selectedTag && isNameEqual(selectedTag.name, tag.name),
                appliedToSelectedRegions: selectedRegionTagSet.has(tag.name),
                onClick: this.onTagItemClick,
                onRename: this.onTagRename,
            } as ITagInputItemProps
        ));
    }

    private getSelectedRegionTagSet = (): Set<string> => {
        const result = new Set<string>();
        if (this.props.selectedRegions) {
            for (const region of this.props.selectedRegions) {
                for (const tag of region.tags) {
                    result.add(tag);
                }
            }
        }
        return result;
    }

    private onTagItemClick = (tag: ITag, props: ITagClickProps) => {
        if (props.ctrlKey && this.props.onCtrlTagClick) { // Lock tags
            this.props.onCtrlTagClick(tag);
        } else if (props.altKey) { // Edit tag
            this.setState({
                selectedTag: tag,
                tagOperation: TagOperationMode.Rename,
            });
        } else if (props.clickedDropDown) {
            const { selectedTag } = this.state;
            const showContextualMenu = !selectedTag || !isNameEqual(selectedTag.name, tag.name)
                || this.state.tagOperation !== TagOperationMode.ContextualMenu;
            const tagOperation = showContextualMenu ? TagOperationMode.ContextualMenu : TagOperationMode.None;
            this.setState({
                selectedTag: tag,
                tagOperation,
            });
        } else if (props.clickedColor) {
            const { selectedTag, tagOperation } = this.state;
            const showColorPicker = tagOperation !== TagOperationMode.ColorPicker;
            const newTagOperation = showColorPicker ? TagOperationMode.ColorPicker : TagOperationMode.None;
            this.setState({
                selectedTag: showColorPicker ? tag : selectedTag,
                tagOperation: newTagOperation,
            });
        } else { // Select tag
            const { selectedTag, tagOperation: oldTagOperation } = this.state;
            const selected = selectedTag && isNameEqual(selectedTag.name, tag.name);
            const tagOperation = selected ? oldTagOperation : TagOperationMode.None;
            let deselect = selected && oldTagOperation === TagOperationMode.None;

            // Only fire click event if a region is selected
            const { selectedRegions, onTagClick, labels } = this.props;
            if (selectedRegions && selectedRegions.length && onTagClick) {
                const { category } = selectedRegions[0];
                const { format, type, documentCount, name } = tag;
                const tagCategory = this.getTagCategory(type);
                if (tagCategory === category ||
                    (documentCount === 0 && type === FieldType.String && format === FieldFormat.NotSpecified)) {
                    if (category === "checkbox" && this.labelAssigned(labels, name)) {
                        toast.warn(strings.tags.warnings.checkboxPerTagLimit);
                        return;
                    }
                    onTagClick(tag);
                    deselect = false;
                } else {
                    toast.warn(strings.tags.warnings.notCompatibleTagType);
                }
            }
            this.setState({
                selectedTag: deselect ? null : tag,
                tagOperation,
            });
        }
    }

    private labelAssigned = (labels, name): boolean => {
         return labels.find((label) => label.label === name ? true : false);
    }

    private getTagCategory = (tagType: string) => {
        switch (tagType) {
            case FieldType.SelectionMark:
                return "checkbox";
            default:
                return "text";
        }
    }

    private onSearchKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            this.setState({
                searchTags: false,
            });
        }
    }

    private onAddTagKeyDown = (event) => {
        // Add handle mouse event functionality
        if (event.key === "Enter") {
            // validate and add
            this.creatTagInput(event.target.value.trim());
            event.target.value = "";
        }
        if (event.key === "Escape") {
            this.setState({
                addTags: false,
            });
        }
    }

    private onAddTagWithBlur = (event: any) => {
        if (event.target.value) {
            this.creatTagInput(event.target.value.trim());
            event.target.value = "";
        }
    }

    private creatTagInput = (value: any) => {
        const newTag: ITag = {
                name: value,
                color: getNextColor(this.state.tags),
                type: FieldType.String,
                format: FieldFormat.NotSpecified,
                documentCount: 0,
        };
        if (newTag.name.length && ![...this.state.tags, newTag].containsDuplicates((t) => t.name)) {
            this.addTag(newTag);
        } else if (!newTag.name.length) {
            toast.warn(strings.tags.warnings.emptyName);
        } else {
            toast.warn(strings.tags.warnings.existingName);
        }
    }

    private validateTagLength = (tag: ITag) => {
        if (!tag.name.trim().length) {
            throw new Error(strings.tags.warnings.emptyName);
        }
        if (tag.name.length >= 128) {
            throw new Error("Tag name is too long (>= 128).");
        }
    }

    private validateTagUniqness = (tag: ITag, tags: ITag[]) => {
        if (tags.some((t) => isNameEqual(t.name, tag.name))) {
            throw new Error(strings.tags.warnings.existingName);
        }
    }

    private onHideContextualMenu = () => {
        this.setState({tagOperation: TagOperationMode.None});
    }

    private getContextualMenuItems = (): IContextualMenuItem[] => {
        const tag = this.state.selectedTag;
        if (!tag) {
            return [];
        }

        const menuItems: IContextualMenuItem[] = [
            {
                key: "type",
                iconProps: {
                    iconName: "Link",
                },
                text: tag.type ? tag.type : strings.tags.toolbar.type,
                subMenuProps: {
                    items: this.getTypeSubMenuItems(),
                },
            },
            {
                key: "format",
                iconProps: {
                    iconName: "Link",
                },
                text: tag.format ? tag.format : strings.tags.toolbar.format,
                subMenuProps: {
                    items: this.getFormatSubMenuItems(),
                },
            },
            {
                key: "divider_1",
                itemType: ContextualMenuItemType.Divider,
            },
            {
                key: TagMenuItem.Rename,
                iconProps: {
                    iconName: "Rename",
                },
                text: strings.tags.toolbar.rename,
                onClick: this.onMenuItemClick,
            },
            {
                key: TagMenuItem.MoveUp,
                iconProps: {
                    iconName: "Up",
                },
                text: strings.tags.toolbar.moveUp,
                onClick: this.onMenuItemClick,
            },
            {
                key: TagMenuItem.MoveDown,
                iconProps: {
                    iconName: "Down",
                },
                text: strings.tags.toolbar.moveDown,
                onClick: this.onMenuItemClick,
            },
            {
                key: TagMenuItem.Delete,
                iconProps: {
                    iconName: "Delete",
                },
                text: strings.tags.toolbar.delete,
                onClick: this.onMenuItemClick,
            },
        ];

        return menuItems;
    }

    private isTypeCompatibleWithTag = (tag, type) => {
        // If free tag we can assign any type
        if (tag && tag.documentCount <= 0) {
            return true;
        }
        const tagType = this.getTagCategory(tag.type);
        const menuItemType = this.getTagCategory(type);
        return tagType === menuItemType;
    }

    private getTypeSubMenuItems = (): IContextualMenuItem[] => {
        const tag = this.state.selectedTag;
        const types = Object.values(FieldType);
        return types.map((type) => {
            const isCompatible = this.isTypeCompatibleWithTag(tag, type);
            return {
                key: type,
                text: type,
                canCheck: isCompatible,
                isChecked: type === tag.type,
                onClick: this.onTypeSelect,
                disabled: !isCompatible,
            } as IContextualMenuItem;
        });
    }

    private getFormatSubMenuItems = (): IContextualMenuItem[] => {
        const tag = this.state.selectedTag;
        const formats = filterFormat(tag.type);

        return formats.map((format) => {
            return {
                key: format,
                text: format,
                canCheck: true,
                isChecked: format === tag.format,
                onClick: this.onFormatSelect,
            } as IContextualMenuItem;
        });
    }

    private onTypeSelect = (event: React.MouseEvent<HTMLButtonElement>, item?: IContextualMenuItem): void => {
        event.preventDefault();
        const type = item.text as FieldType;
        const tag = this.state.selectedTag;
        if (type === tag.type) {
            return;
        }

        const newTag = {
            ...tag,
            type,
            format: FieldFormat.NotSpecified,
        };

        if (this.props.onTagChanged) {
            this.props.onTagChanged(tag, newTag);
        }
    }

    private onFormatSelect = (event: React.MouseEvent<HTMLButtonElement>, item?: IContextualMenuItem): void => {
        event.preventDefault();
        const format = item.text as FieldFormat;
        const tag = this.state.selectedTag;
        if (format === tag.format) {
            return;
        }

        const newTag = {
            ...tag,
            format,
        };

        if (this.props.onTagChanged) {
            this.props.onTagChanged(tag, newTag);
        }
    }

    private onMenuItemClick = (event: React.MouseEvent<HTMLButtonElement>, item?: IContextualMenuItem): void => {
        event.preventDefault();
        const tag = this.state.selectedTag;
        if (!tag) {
            return;
        }

        switch (item.key) {
            case TagMenuItem.MoveDown:
                this.onReOrder(tag, 1);
                break;
            case TagMenuItem.MoveUp:
                this.onReOrder(tag, -1);
                break;
            case TagMenuItem.Rename:
                this.onRenameTag(tag);
                break;
            case TagMenuItem.Delete:
                this.onDeleteTag(tag);
                break;
        }
    }
}
