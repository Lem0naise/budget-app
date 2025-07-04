// Chart.js plugin for rendering comparison selection visualization
import { Plugin } from 'chart.js';
import { format } from 'date-fns';

// Throttle function to limit the frequency of real-time updates
let lastUpdateTime = 0;
const THROTTLE_DELAY = 50; // 50ms throttle to prevent excessive updates

export const comparisonSelectionPlugin: Plugin<'line'> = {
  id: 'comparisonSelection',
  beforeDraw: (chart, args, options) => {
    const { selectionState } = options as any;
    
    if (!selectionState) return;
    
    const { 
      dragStartDataIndex, 
      dragEndDataIndex, 
      chartData, 
      selectedCategories,
      shouldShowDistanceFromGoal,
      distanceFromGoalData,
      onRealTimeUpdate,
      calculateComparisonData
    } = selectionState;
    
    // Trigger real-time comparison data update during dragging (with throttling)
    if (onRealTimeUpdate && calculateComparisonData && 
        dragStartDataIndex !== null && dragEndDataIndex !== null &&
        chartData && chartData.dataPoints && chartData.dataPoints.length > 0) {
      
      const now = Date.now();
      if (now - lastUpdateTime < THROTTLE_DELAY) {
        return; // Skip update if throttle period hasn't passed
      }
      lastUpdateTime = now;
      
      try {
        // Use the main chart data points for dates/structure
        const dataToUse = chartData.dataPoints;
        const datasetsToUse = shouldShowDistanceFromGoal ? distanceFromGoalData.datasets : undefined;
        
        // Calculate comparison data for the current selection
        const comparisonData = calculateComparisonData(
          dragStartDataIndex, 
          dragEndDataIndex, 
          dataToUse, 
          datasetsToUse
        );
        
        // Update the comparison data in real-time
        if (comparisonData) {
          onRealTimeUpdate(comparisonData);
        }
      } catch (error) {
        console.error('Error calculating real-time comparison data:', error);
      }
    }
  },
  afterDraw: (chart, args, options) => {
    const { ctx, chartArea, scales } = chart;
    const { left, right, top, bottom } = chartArea;
    const { selectionState } = options as any;
    
    if (!selectionState) return;
    
    const { 
      dragStartDataIndex, 
      dragEndDataIndex, 
      hoverDataIndex,
      chartData, 
      selectedCategories,
      shouldShowDistanceFromGoal,
      distanceFromGoalData,
      isDragging
    } = selectionState;
    
    // Draw hover line if hovering (and not dragging and no active drag selection)
    const hasDragSelection = dragStartDataIndex !== null && dragEndDataIndex !== null;
    if (hoverDataIndex !== null && !isDragging && !hasDragSelection) {
      ctx.save();
      
      if (!chartData.dataPoints || chartData.dataPoints.length === 0) {
        ctx.restore();
        return;
      }
      
      const clampedIndex = Math.max(0, Math.min(hoverDataIndex, chartData.dataPoints.length - 1));
      const roundedIndex = Math.round(clampedIndex);
      const point = chartData.dataPoints[roundedIndex];
      
      if (point) {
        const date = new Date(point.x);
        const x = scales.x.getPixelForValue(date.getTime());
        
        if (!isNaN(x)) {
          // Draw vertical hover line
          ctx.beginPath();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(186, 194, 255, 0.8)';
          ctx.lineWidth = 2;
          ctx.moveTo(x, top);
          ctx.lineTo(x, bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Draw date label
          try {
            const dateLabel = format(date, 'MMM dd');
            ctx.font = 'bold 12px Gabarito, system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            
            const textWidth = ctx.measureText(dateLabel).width;
            const textHeight = 16;
            const padding = 8;
            const labelY = bottom + 20;
            
            // Adjust label position to keep it within chart bounds
            let labelX = x;
            const labelWidth = textWidth + padding * 2;
            
            // If label would extend past right edge, move it left
            if (labelX + labelWidth/2 > right) {
              labelX = right - labelWidth/2;
            }
            // If label would extend past left edge, move it right
            if (labelX - labelWidth/2 < left) {
              labelX = left + labelWidth/2;
            }
            
            // Draw background for date label
            ctx.fillStyle = 'rgba(186, 194, 255, 0.9)';
            
            // Helper function to draw a proper rounded rectangle
            const drawRoundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
              ctx.beginPath();
              ctx.moveTo(x + radius, y);
              ctx.lineTo(x + width - radius, y);
              ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
              ctx.lineTo(x + width, y + height - radius);
              ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
              ctx.lineTo(x + radius, y + height);
              ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
              ctx.lineTo(x, y + radius);
              ctx.quadraticCurveTo(x, y, x + radius, y);
              ctx.closePath();
            };
            
            // Draw rounded background
            const rectX = labelX - textWidth/2 - padding;
            const rectY = labelY - textHeight/2 - padding/2;
            const rectWidth = textWidth + padding * 2;
            const rectHeight = textHeight + padding;
            const radius = 6;
            
            drawRoundedRect(rectX, rectY, rectWidth, rectHeight, radius);
            ctx.fill();
            
            // Draw border with same rounded rectangle
            ctx.strokeStyle = '#bac2ff';
            ctx.lineWidth = 1;
            drawRoundedRect(rectX, rectY, rectWidth, rectHeight, radius);
            ctx.stroke();
            
            // Draw text
            ctx.fillStyle = '#0a0a0a';
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            ctx.shadowBlur = 1;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            ctx.fillText(dateLabel, labelX, labelY + 2);
            
            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
          } catch (error) {
            console.error('Error formatting hover date label:', error);
          }
        }
      }
      
      ctx.restore();
    }
    
    // Only draw selection lines if we have valid selection
    if (dragStartDataIndex !== null && dragEndDataIndex !== null) {
      ctx.save();
      
      // Always use the main chart data points for x-axis positions
      if (!chartData.dataPoints || chartData.dataPoints.length === 0) {
        ctx.restore();
        return;
      }
      
      // Helper function to get position and date - snaps to actual data points when not dragging
      const getPosition = (fractionalIndex: number, isDragging: boolean) => {
        const clampedIndex = Math.max(0, Math.min(fractionalIndex, chartData.dataPoints.length - 1));
        
        // If not currently dragging, snap to the nearest data point
        if (!isDragging) {
          const snappedIndex = Math.round(clampedIndex);
          const point = chartData.dataPoints[snappedIndex];
          const date = new Date(point.x);
          return {
            x: scales.x.getPixelForValue(date.getTime()),
            date: date,
            snappedIndex: snappedIndex
          };
        }
        
        // During dragging, use interpolated positions for smooth interaction
        const lowerIndex = Math.floor(clampedIndex);
        const upperIndex = Math.min(Math.ceil(clampedIndex), chartData.dataPoints.length - 1);
        
        if (lowerIndex === upperIndex) {
          // Exact index, no interpolation needed
          const point = chartData.dataPoints[lowerIndex];
          const date = new Date(point.x);
          return {
            x: scales.x.getPixelForValue(date.getTime()),
            date: date,
            snappedIndex: lowerIndex
          };
        }
        
        // Interpolate between two data points during dragging
        const ratio = clampedIndex - lowerIndex;
        const lowerPoint = chartData.dataPoints[lowerIndex];
        const upperPoint = chartData.dataPoints[upperIndex];
        
        const lowerTime = new Date(lowerPoint.x).getTime();
        const upperTime = new Date(upperPoint.x).getTime();
        const interpolatedTime = lowerTime + (upperTime - lowerTime) * ratio;
        
        return {
          x: scales.x.getPixelForValue(interpolatedTime),
          date: new Date(interpolatedTime),
          snappedIndex: Math.round(clampedIndex)
        };
      };
      
      const startPos = getPosition(dragStartDataIndex, isDragging || false);
      const endPos = getPosition(dragEndDataIndex, isDragging || false);
      
      // Check if we got valid pixel positions
      if (isNaN(startPos.x) || isNaN(endPos.x)) {
        ctx.restore();
        return;
      }
      
      // Ensure start is always left of end
      const leftX = Math.min(startPos.x, endPos.x);
      const rightX = Math.max(startPos.x, endPos.x);
      const leftDate = startPos.x <= endPos.x ? startPos.date : endPos.date;
      const rightDate = startPos.x <= endPos.x ? endPos.date : startPos.date;
      
      // Draw vertical lines
      ctx.beginPath();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(186, 194, 255, 0.8)';
      ctx.lineWidth = 2;
      
      // Start line
      ctx.moveTo(leftX, top);
      ctx.lineTo(leftX, bottom);
      
      // End line
      ctx.moveTo(rightX, top);
      ctx.lineTo(rightX, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw shaded area - now works for both single and multiple categories
      // Since we calculate overall change correctly, we can always show the visual feedback
      const shouldDrawShadedArea = true;
      
      if (shouldDrawShadedArea) {      // Use the same logic as the ComparisonAnalysis component for color determination
      let isPositiveChange = false;
      
      try {
        // Calculate color directly from data points for immediate and accurate feedback
        // Use snapped indices when not dragging for precise alignment
        
        let chronoStartIdx, chronoEndIdx;
        if (isDragging) {
          // During dragging, use rounded fractional indices
          chronoStartIdx = Math.min(Math.round(dragStartDataIndex), Math.round(dragEndDataIndex));
          chronoEndIdx = Math.max(Math.round(dragStartDataIndex), Math.round(dragEndDataIndex));
        } else {
          // When not dragging, use the snapped indices for precise data point alignment
          chronoStartIdx = Math.min(startPos.snappedIndex, endPos.snappedIndex);
          chronoEndIdx = Math.max(startPos.snappedIndex, endPos.snappedIndex);
        }
        
        if (shouldShowDistanceFromGoal && distanceFromGoalData.datasets.length > 0) {
          // For multiple categories, calculate overall change (sum of all category changes)
          if (distanceFromGoalData.datasets.length > 1) {
            let overallAbsoluteChange = 0;
            let validDatasetsCount = 0;
            
            // Sum up the changes across all datasets (categories)
            distanceFromGoalData.datasets.forEach((dataset: any) => {
              const chronoStartValue = dataset.data[chronoStartIdx]?.y;
              const chronoEndValue = dataset.data[chronoEndIdx]?.y;
              if (chronoStartValue !== undefined && chronoEndValue !== undefined) {
                overallAbsoluteChange += chronoEndValue - chronoStartValue;
                validDatasetsCount++;
              }
            });
            
            // Only use the overall change if we have valid data from multiple datasets
            if (validDatasetsCount > 0) {
              isPositiveChange = overallAbsoluteChange >= 0;
            }
          } else {
            // For single category, use the dataset values directly
            const dataset = distanceFromGoalData.datasets[0];
            const chronoStartValue = dataset.data[chronoStartIdx]?.y;
            const chronoEndValue = dataset.data[chronoEndIdx]?.y;
            if (chronoStartValue !== undefined && chronoEndValue !== undefined) {
              // For distance from goal: match ComparisonAnalysis logic
              // absoluteChange = endValue - startValue, so positive when distance increases (bad)
              // We want green when absoluteChange >= 0 to match ComparisonAnalysis component
              const absoluteChange = chronoEndValue - chronoStartValue;
              isPositiveChange = absoluteChange >= 0;
            }
          }
        } else {
          // For balance tracking, use the chart data points
          const chronoStartPoint = chartData.dataPoints[chronoStartIdx];
          const chronoEndPoint = chartData.dataPoints[chronoEndIdx];
          if (chronoStartPoint && chronoEndPoint) {
            // For balance: positive change = balance increased from earlier to later date (green)
            // absoluteChange = endValue - startValue, so positive when balance increases (good)
            const absoluteChange = chronoEndPoint.y - chronoStartPoint.y;
            isPositiveChange = absoluteChange >= 0;
          }
        }
        } catch (error) {
          // If there's an error, default to positive
          isPositiveChange = true;
        }
        
        // Set fill color based on change direction - use exact same colors as ComparisonAnalysis
        // text-green = #bac2ff (light blue), text-reddy = #f2602f (orange-red)
        ctx.fillStyle = isPositiveChange 
          ? 'rgba(186, 194, 255, 0.15)'  // Light blue with transparency (matches text-green)
          : 'rgba(242, 96, 47, 0.15)';   // Orange-red with transparency (matches text-reddy)
        
        ctx.fillRect(leftX, top, rightX - leftX, bottom - top);
      }
      
      // Draw highlighted date labels below the chart area but above x-axis labels
      try {
        const startLabel = format(leftDate, 'MMM dd');
        const endLabel = format(rightDate, 'MMM dd');
        
        // Set up text styling
        ctx.font = 'bold 12px Gabarito, system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        
        // Calculate text dimensions for background
        const startTextWidth = ctx.measureText(startLabel).width;
        const endTextWidth = ctx.measureText(endLabel).width;
        const textHeight = 16;
        const padding = 8;
        
        // Position labels below chart area but above x-axis labels
        // This creates a dedicated vertical space for selection labels
        const labelY = bottom + 20;
        
        // Adjust label positions to keep them within chart bounds
        let adjustedLeftX = leftX;
        let adjustedRightX = rightX;
        
        const startLabelWidth = startTextWidth + padding * 2;
        const endLabelWidth = endTextWidth + padding * 2;
        
        // If start label would extend past left edge, move it right
        if (adjustedLeftX - startLabelWidth/2 < left) {
          adjustedLeftX = left + startLabelWidth/2;
        }
        // If start label would extend past right edge, move it left
        if (adjustedLeftX + startLabelWidth/2 > right) {
          adjustedLeftX = right - startLabelWidth/2;
        }
        
        // If end label would extend past right edge, move it left
        if (adjustedRightX + endLabelWidth/2 > right) {
          adjustedRightX = right - endLabelWidth/2;
        }
        // If end label would extend past left edge, move it right
        if (adjustedRightX - endLabelWidth/2 < left) {
          adjustedRightX = left + endLabelWidth/2;
        }
        
        // Draw background rectangles for labels with rounded corners
        ctx.fillStyle = 'rgba(186, 194, 255, 0.9)'; // Light blue background
        
        // Helper function to draw rounded rectangle
        const drawRoundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
          ctx.beginPath();
          ctx.moveTo(x + radius, y);
          ctx.lineTo(x + width - radius, y);
          ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
          ctx.lineTo(x + width, y + height - radius);
          ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
          ctx.lineTo(x + radius, y + height);
          ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
          ctx.lineTo(x, y + radius);
          ctx.quadraticCurveTo(x, y, x + radius, y);
          ctx.closePath();
        };
        
        // Draw rounded background for start label
        drawRoundedRect(adjustedLeftX - startTextWidth/2 - padding, labelY - textHeight/2 - padding/2, 
                       startTextWidth + padding*2, textHeight + padding, 4);
        ctx.fill();
        
        // Draw rounded background for end label
        drawRoundedRect(adjustedRightX - endTextWidth/2 - padding, labelY - textHeight/2 - padding/2, 
                       endTextWidth + padding*2, textHeight + padding, 4);
        ctx.fill();
        
        // Draw border around labels
        ctx.strokeStyle = '#bac2ff';
        ctx.lineWidth = 2;
        
        drawRoundedRect(adjustedLeftX - startTextWidth/2 - padding, labelY - textHeight/2 - padding/2, 
                       startTextWidth + padding*2, textHeight + padding, 4);
        ctx.stroke();
        
        drawRoundedRect(adjustedRightX - endTextWidth/2 - padding, labelY - textHeight/2 - padding/2, 
                       endTextWidth + padding*2, textHeight + padding, 4);
        ctx.stroke();
        
        // Draw the text labels with shadow for better readability
        ctx.fillStyle = '#0a0a0a'; // Dark text for contrast
        ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
        ctx.shadowBlur = 1;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;
        
        ctx.fillText(startLabel, adjustedLeftX, labelY + 2);
        ctx.fillText(endLabel, adjustedRightX, labelY + 2);
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } catch (error) {
        console.error('Error formatting dates for labels:', error);
      }
      
      ctx.restore();
    }
    
    // --- Draw horizontal zero line for clarity ---
    if (scales.y) {
      const yScale = scales.y;
      // Only draw if zero is within the visible y range
      if (yScale.min < 0 && yScale.max > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(left, yScale.getPixelForValue(0));
        ctx.lineTo(right, yScale.getPixelForValue(0));
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.setLineDash([8, 10]);
        ctx.globalAlpha = 0.8;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
    // --- End horizontal zero line ---
  }
};
